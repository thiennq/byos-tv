# 📺 BYOS TV — Public Content Catalogs & Fastly CDN ($0 Server)

[![Deploy BYOS Catalogs to GitHub Pages](https://github.com/thiennq/byos-tv/actions/workflows/deploy-catalogs.yml/badge.svg)](https://github.com/thiennq/byos-tv/actions/workflows/deploy-catalogs.yml)
[![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-Active-success?logo=github)](https://thiennq.github.io/byos-tv/index.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Official public content distribution repository for **BYOS TV** (Living-room 10-foot UI TV App).
Distributed globally with **$0 Server Cost** and unlimited bandwidth via Fastly / GitHub Pages CDN.

---

## 🌐 Public CDN Endpoints

| Catalog Source | CDN Manifest Endpoint | Description |
| :--- | :--- | :--- |
| **Root Index** | [`https://thiennq.github.io/byos-tv/index.json`](https://thiennq.github.io/byos-tv/index.json) | Root manifest indexing all active categories |
| **4K Open Movies** | [`https://thiennq.github.io/byos-tv/byos-open-movies/manifest.json`](https://thiennq.github.io/byos-tv/byos-open-movies/manifest.json) | 4K/HDR 60fps Blender Foundation masterpieces |
| **Free-to-Air Live TV** | [`https://thiennq.github.io/byos-tv/byos-live-tv/manifest.json`](https://thiennq.github.io/byos-tv/byos-live-tv/manifest.json) | Legal public broadcast channels (HLS live streams) |
| **Classic Cinema** | [`https://thiennq.github.io/byos-tv/byos-classic-cinema/manifest.json`](https://thiennq.github.io/byos-tv/byos-classic-cinema/manifest.json) | Timeless Public Domain cinema classics |
| **4K Trailers** | [`https://thiennq.github.io/byos-tv/byos-trailers/manifest.json`](https://thiennq.github.io/byos-tv/byos-trailers/manifest.json) | In-theaters 4K trailers & Apple fMP4 showcase |

---

## 🚀 Automated Validation & Deployment
Every commit and daily cron job automatically triggers [`.github/workflows/deploy-catalogs.yml`](.github/workflows/deploy-catalogs.yml):
1. Probes 100% video stream URLs (HTTP Range GET & HLS parser).
2. Removes dead/unreachable streams (`--filter-dead`).
3. Minifies JSON payloads (`--minify`) and computes SHA256 integrity checksums.
4. Deploys to GitHub Pages CDN in < 45 seconds.

---

## 🛠️ How to Add or Update Content
1. Fork or clone this repository:
   ```bash
   git clone https://github.com/thiennq/byos-tv.git
   ```
2. Edit or add sources in `catalogs/sources/*.json`.
3. Validate locally:
   ```bash
   python3 scripts/catalog_validator.py --input catalogs/sources/ --output dist/ --check-streams --distribution
   ```
4. Push to `main` branch to trigger instant global CDN deployment.
