#!/usr/bin/env python3
"""
@file: scripts/catalog_validator.py
@description: Automated CLI tool to validate catalog JSON schemas, verify stream URL health
              (HEAD/Range GET requests, HLS .m3u8 playlist parsing, latency probing),
              and build clean, production-ready catalog manifests.
@usage:
  python3 scripts/catalog_validator.py --help
  python3 scripts/catalog_validator.py --input catalogs/sources/ --output catalogs/dist/ --check-streams
  python3 scripts/catalog_validator.py --check-streams --input client/assets/catalogs/default_catalogs.json
"""

import argparse
import concurrent.futures
import http.client
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36 BYOS/1.0"
)

# Create an SSL context that allows standard certificates
SSL_CONTEXT = ssl.create_default_context()
SSL_CONTEXT.check_hostname = False
SSL_CONTEXT.verify_mode = ssl.CERT_NONE


class StreamCheckResult:
    def __init__(
        self,
        url: str,
        alive: bool,
        status_code: int = 0,
        latency_ms: float = 0.0,
        content_type: str = "",
        format_detected: str = "",
        error_msg: str = "",
    ):
        self.url = url
        self.alive = alive
        self.status_code = status_code
        self.latency_ms = latency_ms
        self.content_type = content_type
        self.format_detected = format_detected
        self.error_msg = error_msg

    def to_dict(self) -> Dict[str, Any]:
        return {
            "url": self.url,
            "alive": self.alive,
            "status_code": self.status_code,
            "latency_ms": round(self.latency_ms, 2),
            "content_type": self.content_type,
            "format_detected": self.format_detected,
            "error_msg": self.error_msg,
        }


def check_stream_url(url: str, timeout: float = 6.0) -> StreamCheckResult:
    """Probes a media stream URL to verify accessibility, latency, and content type."""
    if not url or not (url.startswith("http://") or url.startswith("https://")):
        return StreamCheckResult(
            url=url, alive=False, error_msg="Invalid URL scheme"
        )

    is_hls = ".m3u8" in url.lower() or "hls" in url.lower()
    start_time = time.time()

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "*/*",
    }

    # For static video files, use Range request to avoid downloading the entire file
    if not is_hls:
        headers["Range"] = "bytes=0-1024"

    req = urllib.request.Request(url, headers=headers, method="GET")

    try:
        with urllib.request.urlopen(req, timeout=timeout, context=SSL_CONTEXT) as response:
            latency_ms = (time.time() - start_time) * 1000.0
            status_code = response.status
            content_type = response.headers.get("Content-Type", "")

            # Check for valid HTTP status
            if status_code not in (200, 206, 301, 302, 307, 308):
                return StreamCheckResult(
                    url=url,
                    alive=False,
                    status_code=status_code,
                    latency_ms=latency_ms,
                    content_type=content_type,
                    error_msg=f"HTTP status {status_code}",
                )

            # Check HLS M3U8 content
            if is_hls:
                # Read initial chunk to verify #EXTM3U tag
                body_chunk = response.read(2048).decode("utf-8", errors="ignore")
                if "#EXTM3U" not in body_chunk and "#EXT" not in body_chunk:
                    return StreamCheckResult(
                        url=url,
                        alive=False,
                        status_code=status_code,
                        latency_ms=latency_ms,
                        content_type=content_type,
                        format_detected="invalid-hls",
                        error_msg="Missing #EXTM3U manifest header",
                    )
                return StreamCheckResult(
                    url=url,
                    alive=True,
                    status_code=status_code,
                    latency_ms=latency_ms,
                    content_type=content_type,
                    format_detected="hls",
                )

            # For regular media files
            detected_format = "mp4"
            if ".mkv" in url.lower():
                detected_format = "mkv"
            elif ".webm" in url.lower():
                detected_format = "webm"

            return StreamCheckResult(
                url=url,
                alive=True,
                status_code=status_code,
                latency_ms=latency_ms,
                content_type=content_type,
                format_detected=detected_format,
            )

    except urllib.error.HTTPError as e:
        latency_ms = (time.time() - start_time) * 1000.0
        # If server rejected Range with 416, try a HEAD request
        if e.code in (405, 416, 403) and not is_hls:
            try:
                head_req = urllib.request.Request(
                    url, headers={"User-Agent": USER_AGENT}, method="HEAD"
                )
                with urllib.request.urlopen(head_req, timeout=timeout, context=SSL_CONTEXT) as head_resp:
                    latency_ms = (time.time() - start_time) * 1000.0
                    return StreamCheckResult(
                        url=url,
                        alive=head_resp.status in (200, 206, 301, 302),
                        status_code=head_resp.status,
                        latency_ms=latency_ms,
                        content_type=head_resp.headers.get("Content-Type", ""),
                        format_detected="mp4",
                    )
            except Exception:
                pass

        return StreamCheckResult(
            url=url,
            alive=False,
            status_code=e.code,
            latency_ms=latency_ms,
            error_msg=f"HTTP {e.code}: {e.reason}",
        )
    except urllib.error.URLError as e:
        latency_ms = (time.time() - start_time) * 1000.0
        return StreamCheckResult(
            url=url,
            alive=False,
            status_code=0,
            latency_ms=latency_ms,
            error_msg=f"Connection error: {e.reason}",
        )
    except Exception as e:
        latency_ms = (time.time() - start_time) * 1000.0
        return StreamCheckResult(
            url=url,
            alive=False,
            status_code=0,
            latency_ms=latency_ms,
            error_msg=f"Probe failed: {str(e)}",
        )


def validate_catalog_schema(data: Any, filepath: str) -> Tuple[bool, List[str]]:
    """Validates that the JSON object conforms to the BYOS Catalog schema."""
    errors = []
    if not isinstance(data, dict):
        return False, ["Root JSON must be an object"]

    # Can be CatalogManifest (with catalogs: [...]) or Single CatalogCategory
    if "catalogs" in data or "categories" in data:
        cats = data.get("catalogs") or data.get("categories")
        if not isinstance(cats, list):
            errors.append("Field 'catalogs' must be an array")
        else:
            for idx, cat in enumerate(cats):
                if not isinstance(cat, dict):
                    errors.append(f"Catalog at index {idx} must be an object")
                    continue
                if not cat.get("id"):
                    errors.append(f"Catalog at index {idx} is missing 'id'")
                if not cat.get("name"):
                    errors.append(f"Catalog '{cat.get('id', idx)}' is missing 'name'")
                items = cat.get("items", [])
                if not isinstance(items, list):
                    errors.append(f"Catalog '{cat.get('id', idx)}' items must be a list")
                else:
                    for i_idx, item in enumerate(items):
                        _validate_media_item(item, f"{cat.get('id', idx)}.items[{i_idx}]", errors)
    elif "items" in data:
        # Single category file
        if not data.get("id"):
            errors.append("Single category missing 'id'")
        if not data.get("name"):
            errors.append("Single category missing 'name'")
        items = data.get("items", [])
        if not isinstance(items, list):
            errors.append("Field 'items' must be an array")
        else:
            for i_idx, item in enumerate(items):
                _validate_media_item(item, f"items[{i_idx}]", errors)
    else:
        errors.append("Root JSON must contain either 'catalogs' or 'items'")

    return len(errors) == 0, errors


def _validate_media_item(item: Any, path_prefix: str, errors: List[str]):
    if not isinstance(item, dict):
        errors.append(f"{path_prefix} must be an object")
        return
    if not item.get("id"):
        errors.append(f"{path_prefix} missing 'id'")
    if not item.get("title"):
        errors.append(f"{path_prefix} missing 'title'")

    streams = item.get("streams", [])
    if not isinstance(streams, list) or len(streams) == 0:
        # Check fallback stream_url
        if not item.get("stream_url") and not item.get("streamUrl"):
            errors.append(f"{path_prefix} ({item.get('title', 'Unknown')}) has no streams defined")
    else:
        for s_idx, stream in enumerate(streams):
            if not isinstance(stream, dict):
                errors.append(f"{path_prefix}.streams[{s_idx}] must be an object")
                continue
            if not stream.get("url"):
                errors.append(f"{path_prefix}.streams[{s_idx}] missing 'url'")


def collect_all_stream_urls(data: Any) -> List[Tuple[str, str, str]]:
    """Extracts all stream URLs along with their item title and category for verification."""
    results = []
    categories = []
    if isinstance(data, dict):
        if "catalogs" in data or "categories" in data:
            categories = data.get("catalogs") or data.get("categories") or []
        elif "items" in data:
            categories = [data]

    for cat in categories:
        cat_name = cat.get("name", cat.get("id", "Unknown Category"))
        for item in cat.get("items", []):
            item_title = item.get("title", item.get("id", "Unknown Item"))
            for stream in item.get("streams", []):
                if isinstance(stream, dict) and stream.get("url"):
                    results.append((cat_name, item_title, stream.get("url")))
            if item.get("stream_url"):
                results.append((cat_name, item_title, item.get("stream_url")))

    return results


def check_all_streams(
    urls: List[Tuple[str, str, str]], max_workers: int = 12, timeout: float = 6.0
) -> Dict[str, StreamCheckResult]:
    """Probes all unique stream URLs concurrently using ThreadPoolExecutor."""
    unique_urls = list(set(url for _, _, url in urls))
    results: Dict[str, StreamCheckResult] = {}

    print(f"\n🚀 Probing {len(unique_urls)} unique stream URLs with {max_workers} worker threads...")

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_url = {
            executor.submit(check_stream_url, url, timeout): url
            for url in unique_urls
        }
        for future in concurrent.futures.as_completed(future_to_url):
            url = future_to_url[future]
            try:
                res = future.result()
                results[url] = res
            except Exception as exc:
                results[url] = StreamCheckResult(
                    url=url, alive=False, error_msg=f"Thread exception: {str(exc)}"
                )

    return results


def print_summary_table(
    stream_results: Dict[str, StreamCheckResult], url_metadata: List[Tuple[str, str, str]]
):
    """Prints a styled, clear terminal report of stream health status."""
    total = len(stream_results)
    alive_count = sum(1 for r in stream_results.values() if r.alive)
    dead_count = total - alive_count
    slow_count = sum(1 for r in stream_results.values() if r.alive and r.latency_ms > 2000)

    print("\n" + "=" * 80)
    print("📊 STREAM HEALTH CHECK REPORT")
    print("=" * 80)
    print(f"Total Unique Streams : {total}")
    print(f"✅ Alive             : {alive_count} ({alive_count / total * 100:.1f}%)" if total else "0")
    print(f"❌ Dead / Unreachable: {dead_count}")
    print(f"⚠️ Slow (>2000ms)    : {slow_count}")
    print("-" * 80)

    # Detailed table
    print(f"{'Status':<8} | {'HTTP':<5} | {'Latency':<9} | {'Category & Title':<35} | {'URL / Error'}")
    print("-" * 80)

    url_to_meta = {}
    for cat_name, title, u in url_metadata:
        url_to_meta[u] = f"[{cat_name[:12]}] {title[:20]}"

    for url, res in sorted(stream_results.items(), key=lambda x: (not x[1].alive, -x[1].latency_ms)):
        status_icon = "✅ ALIVE" if res.alive else "❌ DEAD"
        if res.alive and res.latency_ms > 2000:
            status_icon = "⚠️ SLOW"
        meta_label = url_to_meta.get(url, "Unknown")
        err_or_url = url if res.alive else f"{res.error_msg} ({url})"
        print(
            f"{status_icon:<8} | {res.status_code:<5} | {f'{res.latency_ms:.0f}ms':<9} | "
            f"{meta_label:<35} | {err_or_url[:60]}"
        )

    print("=" * 80 + "\n")


SOURCE_TO_DIST_SLUG = {
    "open-movies": "byos-open-movies",
    "open_movies": "byos-open-movies",
    "open_movies_4k": "byos-open-movies",
    "iptv-channels": "byos-live-tv",
    "iptv_channels": "byos-live-tv",
    "live_tv_free": "byos-live-tv",
    "classic-movies": "byos-classic-cinema",
    "classic_movies": "byos-classic-cinema",
    "classic_cinema": "byos-classic-cinema",
    "trailers": "byos-trailers",
    "theater_trailers": "byos-trailers",
}


def process_and_export_catalogs(
    input_path: Path,
    output_dir: Optional[Path],
    check_streams: bool = False,
    filter_dead: bool = False,
    build_distribution: bool = False,
    minify: bool = False,
    timeout: float = 6.0,
    workers: int = 12,
) -> bool:
    """Processes catalog file(s), validates schemas, checks streams, and writes output."""
    files_to_process = []
    if input_path.is_file():
        files_to_process.append(input_path)
    elif input_path.is_dir():
        for ext in ("*.json",):
            files_to_process.extend(sorted(input_path.glob(ext)))

    if not files_to_process:
        print(f"❌ No JSON catalog files found at {input_path}")
        return False

    all_valid = True
    all_stream_urls: List[Tuple[str, str, str]] = []
    loaded_data: Dict[Path, Any] = {}

    # Step 1: Schema Validation
    print(f"\n🔍 Validating {len(files_to_process)} catalog JSON file(s)...")
    for fpath in files_to_process:
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
            loaded_data[fpath] = data
            valid, errors = validate_catalog_schema(data, str(fpath))
            if not valid:
                all_valid = False
                print(f"❌ Schema validation failed for {fpath.name}:")
                for err in errors:
                    print(f"   • {err}")
            else:
                print(f"✅ Schema valid: {fpath.name}")
                all_stream_urls.extend(collect_all_stream_urls(data))
        except Exception as e:
            all_valid = False
            print(f"❌ Failed to parse JSON in {fpath.name}: {e}")

    if not all_valid:
        print("\n⚠️ Catalog schema errors detected. Please resolve them before proceeding.")

    # Step 2: Stream Health Probing
    stream_results: Dict[str, StreamCheckResult] = {}
    if check_streams and all_stream_urls:
        stream_results = check_all_streams(
            all_stream_urls, max_workers=workers, timeout=timeout
        )
        print_summary_table(stream_results, all_stream_urls)

        # Check if any streams died
        dead_streams = [u for u, r in stream_results.items() if not r.alive]
        if dead_streams:
            print(f"⚠️ Found {len(dead_streams)} unreachable stream URL(s).")
            if not filter_dead:
                all_valid = False

    # Step 3: Export to Output Directory if requested
    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)
        print(f"\n📦 Exporting validated catalogs to {output_dir}...")
        indent_val = None if minify else 2
        separators = (",", ":") if minify else None

        if build_distribution:
            # Distribution mode: generate root index.json and byos-<slug>/manifest.json folders
            import datetime
            import hashlib

            categories_for_index = []
            manifest_hashes = {}

            for fpath, data in loaded_data.items():
                export_data = data
                if filter_dead and stream_results:
                    export_data = _filter_dead_streams_from_data(data, stream_results)

                # Determine distribution slug
                cat_id = export_data.get("id", fpath.stem)
                dist_slug = SOURCE_TO_DIST_SLUG.get(fpath.stem, SOURCE_TO_DIST_SLUG.get(cat_id, f"byos-{fpath.stem}"))
                relative_manifest_url = f"{dist_slug}/manifest.json"

                # Update category URL to point to its relative manifest location
                category_obj = dict(export_data)
                category_obj["url"] = relative_manifest_url

                # Write sub-catalog manifest: <output_dir>/<dist_slug>/manifest.json
                sub_dir = output_dir / dist_slug
                sub_dir.mkdir(parents=True, exist_ok=True)
                dest_manifest = sub_dir / "manifest.json"

                json_str = json.dumps(category_obj, indent=indent_val, separators=separators, ensure_ascii=False)
                with open(dest_manifest, "w", encoding="utf-8") as f:
                    f.write(json_str)

                # Compute sha256 checksum
                file_hash = hashlib.sha256(json_str.encode("utf-8")).hexdigest()
                manifest_hashes[relative_manifest_url] = file_hash

                print(f"   💾 Generated Sub-Manifest: {dest_manifest} (SHA256: {file_hash[:8]}...)")
                categories_for_index.append(category_obj)

            # Generate root index.json
            now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            root_manifest = {
                "version": 1,
                "updated_at": now_iso,
                "catalogs": categories_for_index,
            }

            index_file = output_dir / "index.json"
            index_json_str = json.dumps(root_manifest, indent=indent_val, separators=separators, ensure_ascii=False)
            with open(index_file, "w", encoding="utf-8") as f:
                f.write(index_json_str)

            index_hash = hashlib.sha256(index_json_str.encode("utf-8")).hexdigest()
            manifest_hashes["index.json"] = index_hash
            print(f"   💾 Generated Root Manifest: {index_file} (SHA256: {index_hash[:8]}...)")

            # Write checksum manifest
            checksum_file = output_dir / "manifest.sha256"
            with open(checksum_file, "w", encoding="utf-8") as f:
                for rel_path, sha in sorted(manifest_hashes.items()):
                    f.write(f"{sha}  {rel_path}\n")
            print(f"   🔒 Written Checksums: {checksum_file}")

        else:
            # Flat export
            for fpath, data in loaded_data.items():
                export_data = data
                if filter_dead and stream_results:
                    export_data = _filter_dead_streams_from_data(data, stream_results)

                dest_file = output_dir / fpath.name
                with open(dest_file, "w", encoding="utf-8") as f:
                    json.dump(export_data, f, indent=indent_val, separators=separators, ensure_ascii=False)
                print(f"   💾 Written: {dest_file}")

    return all_valid


def _filter_dead_streams_from_data(data: Any, stream_results: Dict[str, StreamCheckResult]) -> Any:
    """Removes dead streams or items with no alive streams from catalog data."""
    import copy
    cloned = copy.deepcopy(data)
    categories = []
    if "catalogs" in cloned:
        categories = cloned["catalogs"]
    elif "categories" in cloned:
        categories = cloned["categories"]
    elif "items" in cloned:
        categories = [cloned]

    for cat in categories:
        clean_items = []
        for item in cat.get("items", []):
            clean_streams = []
            for s in item.get("streams", []):
                s_url = s.get("url")
                if s_url and stream_results.get(s_url, StreamCheckResult(url=s_url, alive=True)).alive:
                    clean_streams.append(s)

            # If item still has at least one working stream, keep it
            if clean_streams or not item.get("streams"):
                item["streams"] = clean_streams
                clean_items.append(item)
        cat["items"] = clean_items

    return cloned


def main():
    parser = argparse.ArgumentParser(
        description="BYOS Catalog Validator and Stream Health Checker CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Validate schema and probe streams for all sources:
  python3 scripts/catalog_validator.py --input catalogs/sources/ --check-streams

  # Validate default asset catalog:
  python3 scripts/catalog_validator.py --input client/assets/catalogs/default_catalogs.json --check-streams

  # Build dist catalog and remove dead streams:
  python3 scripts/catalog_validator.py --input catalogs/sources/ --output catalogs/dist/ --check-streams --filter-dead
        """,
    )
    parser.add_argument(
        "-i",
        "--input",
        dest="input_path",
        default="catalogs/sources",
        help="Path to input JSON catalog file or directory (default: catalogs/sources)",
    )
    parser.add_argument(
        "-o",
        "--output",
        dest="output_dir",
        default=None,
        help="Directory to export validated JSON files (optional)",
    )
    parser.add_argument(
        "--check-streams",
        action="store_true",
        help="Perform active network probing and latency check on all media stream URLs",
    )
    parser.add_argument(
        "--filter-dead",
        action="store_true",
        help="Automatically remove unreachable streams when exporting to output directory",
    )
    parser.add_argument(
        "--distribution",
        action="store_true",
        help="Generate standard CDN distribution tree (index.json + byos-<slug>/manifest.json)",
    )
    parser.add_argument(
        "--minify",
        action="store_true",
        help="Minify JSON output files to reduce payload size",
    )
    parser.add_argument(
        "-t",
        "--timeout",
        type=float,
        default=6.0,
        help="Timeout in seconds for network stream checks (default: 6.0)",
    )
    parser.add_argument(
        "-w",
        "--workers",
        type=int,
        default=12,
        help="Number of concurrent worker threads for stream checking (default: 12)",
    )

    args = parser.parse_args()

    # Dynamic path resolution relative to repo root
    repo_root = Path(__file__).resolve().parent.parent
    input_target = Path(args.input_path)
    if not input_target.is_absolute():
        input_target = repo_root / input_target

    output_target = None
    if args.output_dir:
        output_target = Path(args.output_dir)
        if not output_target.is_absolute():
            output_target = repo_root / output_target

    success = process_and_export_catalogs(
        input_path=input_target,
        output_dir=output_target,
        check_streams=args.check_streams,
        filter_dead=args.filter_dead,
        build_distribution=args.distribution,
        minify=args.minify,
        timeout=args.timeout,
        workers=args.workers,
    )

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
