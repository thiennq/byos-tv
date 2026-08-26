/**
 * BYOS Universal Plugin: IPTV Live Streamer
 * Version: 1.1.0
 * Protocol: BYOS Universal JS ES2023 ($0 Server)
 * Description: High-performance Live TV streamer with 240+ countries asset, dynamic channel builder, and 0ms direct playback.
 */

const MAX_CHANNELS_PER_SOURCE = 1000;
const CACHE_STORAGE_KEY = "byos_iptv_cache";
const DEFAULT_AUTO_RELOAD_HOURS = 24;

const PRESET_URLS = {
  iptv_org_vn: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/vn.m3u",
  iptv_org_sports: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/sports.m3u",
  iptv_org_news: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/news.m3u"
};

/**
 * Normalizes HTTP header keys (e.g. user-agent -> User-Agent)
 */
function normalizeHeaderKey(key) {
  const clean = String(key || "").trim().toLowerCase();
  if (clean === "user-agent" || clean === "http-user-agent") return "User-Agent";
  if (clean === "referer" || clean === "referrer" || clean === "http-referrer" || clean === "http-referer") return "Referer";
  if (clean === "origin" || clean === "http-origin") return "Origin";
  if (clean === "cookie") return "Cookie";
  if (clean === "authorization") return "Authorization";
  return key.trim();
}

/**
 * Parses M3U/M3U8 playlist content into structured channel objects.
 * Handles UTF-8 BOM, #EXTVLCOPT, #EXTHTTP, URL pipe headers, and caps MAX_CHANNELS_PER_SOURCE.
 *
 * @param {string} m3uContent - Raw M3U playlist string
 * @param {string} defaultGroup - Default group name for fallback
 * @returns {Array<Object>} List of parsed channels
 */
function parseM3U(m3uContent, defaultGroup) {
  const channels = [];
  if (!m3uContent || typeof m3uContent !== "string") {
    return channels;
  }

  // 1. Strip UTF-8 BOM if present
  let cleanContent = m3uContent;
  if (cleanContent.charCodeAt(0) === 0xFEFF || cleanContent.startsWith("\uFEFF")) {
    cleanContent = cleanContent.slice(1);
  }

  const lines = cleanContent.split(/\r?\n/);
  let currentChannel = null;
  let pendingHeaders = {};

  for (let i = 0; i < lines.length; i++) {
    if (channels.length >= MAX_CHANNELS_PER_SOURCE) {
      break;
    }

    const line = lines[i].trim();
    if (!line) continue;

    // #EXTINF line
    if (line.startsWith("#EXTINF:") || line.startsWith("#extinf:")) {
      currentChannel = {
        id: "",
        name: "",
        logo: "",
        group: defaultGroup || "General",
        streamUrl: "",
        url: "",
        title: "",
        poster: "",
        streams: []
      };
      pendingHeaders = {};

      // Extract tvg-id
      const idMatch = line.match(/tvg-id="([^"]*)"/i);
      if (idMatch && idMatch[1]) {
        currentChannel.id = idMatch[1].trim();
      }

      // Extract tvg-name
      const nameMatch = line.match(/tvg-name="([^"]*)"/i);
      if (nameMatch && nameMatch[1]) {
        currentChannel.name = nameMatch[1].trim();
      }

      // Extract tvg-logo
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      if (logoMatch && logoMatch[1]) {
        currentChannel.logo = logoMatch[1].trim();
      }

      // Extract group-title
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      if (groupMatch && groupMatch[1]) {
        currentChannel.group = groupMatch[1].trim();
      }

      // Extract channel display title after comma
      const commaIdx = line.lastIndexOf(",");
      if (commaIdx !== -1) {
        const title = line.substring(commaIdx + 1).trim();
        if (title && !currentChannel.name) {
          currentChannel.name = title;
        }
      }

      if (!currentChannel.id && currentChannel.name) {
        currentChannel.id = currentChannel.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
      }
    }
    // #EXTVLCOPT header directive
    else if (line.startsWith("#EXTVLCOPT:") || line.startsWith("#extvlcopt:")) {
      const optMatch = line.match(/^#EXTVLCOPT:(?:http-)?([^=]+)=(.*)$/i);
      if (optMatch && optMatch[1] && optMatch[2]) {
        const headerKey = normalizeHeaderKey(optMatch[1]);
        pendingHeaders[headerKey] = optMatch[2].trim();
      }
    }
    // #EXTHTTP json header directive
    else if (line.startsWith("#EXTHTTP:") || line.startsWith("#exthttp:")) {
      const jsonStr = line.substring(line.indexOf(":") + 1).trim();
      try {
        const parsedHeaders = JSON.parse(jsonStr);
        if (parsedHeaders && typeof parsedHeaders === "object") {
          for (const key of Object.keys(parsedHeaders)) {
            pendingHeaders[normalizeHeaderKey(key)] = String(parsedHeaders[key]).trim();
          }
        }
      } catch (e) {
        // ignore malformed JSON header
      }
    }
    // Non-comment line = Stream URL
    else if (!line.startsWith("#") && currentChannel) {
      let rawUrl = line;

      // Extract pipe headers if present (e.g. http://server.com/live.m3u8|User-Agent=Foo&Referer=Bar)
      const pipeIdx = rawUrl.indexOf("|");
      if (pipeIdx !== -1) {
        const headerQuery = rawUrl.substring(pipeIdx + 1);
        rawUrl = rawUrl.substring(0, pipeIdx).trim();

        const params = headerQuery.split("&");
        for (let p = 0; p < params.length; p++) {
          const kv = params[p].split("=");
          if (kv.length === 2) {
            try {
              const hKey = normalizeHeaderKey(decodeURIComponent(kv[0]));
              const hVal = decodeURIComponent(kv[1]).trim();
              pendingHeaders[hKey] = hVal;
            } catch (err) {
              const hKey = normalizeHeaderKey(kv[0]);
              pendingHeaders[hKey] = kv[1].trim();
            }
          }
        }
      }

      currentChannel.streamUrl = rawUrl;
      currentChannel.url = rawUrl;
      currentChannel.title = currentChannel.name;
      currentChannel.poster = currentChannel.logo;

      const isHls = rawUrl.includes(".m3u8") || rawUrl.includes("/hls") || rawUrl.includes("m3u8");
      const streamObj = {
        name: `${currentChannel.name} Live Feed`,
        url: rawUrl,
        format: isHls ? "hls" : "hls",
        quality: "1080p"
      };

      if (Object.keys(pendingHeaders).length > 0) {
        streamObj.headers = { ...pendingHeaders };
      }

      currentChannel.streams = [streamObj];

      if (currentChannel.name && currentChannel.streamUrl) {
        channels.push(currentChannel);
      }
      currentChannel = null;
      pendingHeaders = {};
    }
  }

  return channels;
}

/**
 * Storage helpers with fallback to in-memory cache
 */
let _inMemoryCache = null;

async function getStorageCache(ttlMs) {
  try {
    if (typeof byos !== "undefined" && byos.storage && typeof byos.storage.get === "function") {
      const cached = await byos.storage.get(CACHE_STORAGE_KEY);
      if (cached && Array.isArray(cached.channels) && cached.channels.length > 0) {
        if (!ttlMs || (Date.now() - (cached.timestamp || 0) < ttlMs)) {
          return cached.channels;
        }
      }
    }
  } catch (err) {
    // storage read failed
  }

  if (_inMemoryCache && Array.isArray(_inMemoryCache.channels) && _inMemoryCache.channels.length > 0) {
    if (!ttlMs || (Date.now() - (_inMemoryCache.timestamp || 0) < ttlMs)) {
      return _inMemoryCache.channels;
    }
  }

  return null;
}

async function setStorageCache(channels) {
  const cacheData = {
    timestamp: Date.now(),
    channels: channels
  };
  _inMemoryCache = cacheData;

  try {
    if (typeof byos !== "undefined" && byos.storage && typeof byos.storage.set === "function") {
      await byos.storage.set(CACHE_STORAGE_KEY, cacheData);
    }
  } catch (err) {
    // storage write failed
  }
}

/**
 * Fetches and parses a single source safely
 */
async function fetchSource(source) {
  if (!source || source.enabled === false) return [];

  let targetUrl = "";
  if (source.source_type === "builtin") {
    targetUrl = PRESET_URLS[source.preset_id] || PRESET_URLS.iptv_org_vn;
  } else {
    targetUrl = source.url || "";
  }

  if (!targetUrl) return [];

  try {
    const response = await fetch(targetUrl);
    if (!response.ok && response.status !== 200) {
      return [];
    }
    const m3uText = await response.text();
    return parseM3U(m3uText, source.name || "IPTV");
  } catch (err) {
    return [];
  }
}

const byosPlugin = {
  id: "byos.plugin.iptv",

  /**
   * Dynamic Hook: Returns the list of countries loaded 0ms from the local asset `countries.json`.
   * Formats into [{ label: "🇻🇳 Việt Nam", value: "vn" }, ...]
   */
  async getCountries() {
    if (typeof logger !== "undefined") {
      logger.log("[byos-iptv] Calling getCountries dynamic hook...");
    }
    try {
      let raw = null;
      if (typeof byos !== "undefined" && typeof byos.readAsset === "function") {
        if (typeof logger !== "undefined") {
          logger.log("[byos-iptv] Reading asset countries.json via byos.readAsset()...");
        }
        raw = await byos.readAsset("countries.json");
        if (typeof logger !== "undefined") {
          logger.log("[byos-iptv] Asset raw data:", raw ? (typeof raw === "string" ? `length=${raw.length}` : typeof raw) : "null");
        }
      } else if (typeof logger !== "undefined") {
        logger.warn("[byos-iptv] byos.readAsset is not available in environment");
      }
      if (raw) {
        const list = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(list)) {
          if (typeof logger !== "undefined") {
            logger.log(`[byos-iptv] Successfully parsed ${list.length} countries from asset`);
          }
          return list.map(c => ({
            label: `${c.flag || ""} ${c.name || c.code || ""}`.trim(),
            value: c.code || c.id || "vn"
          }));
        }
      }
    } catch (err) {
      if (typeof logger !== "undefined") {
        logger.error("[byos-iptv] Error in getCountries:", err && err.message ? err.message : String(err));
      }
    }

    if (typeof logger !== "undefined") {
      logger.warn("[byos-iptv] Falling back to default top 3 countries");
    }
    return [
      { label: "🇻🇳 Việt Nam", value: "vn" },
      { label: "🇺🇸 United States", value: "us" },
      { label: "🇬🇧 United Kingdom", value: "uk" }
    ];
  },

  /**
   * Dynamic Hook: Fetches and parses playlist for the selected country, caches in storage,
   * and returns option list [{ label, value: { id, name, logo, url, streams } }].
   */
  async getChannelsByCountry(formValues) {
    if (typeof logger !== "undefined") {
      logger.log("[byos-iptv] Calling getChannelsByCountry with formValues:", formValues);
    }
    let country = "vn";
    if (typeof formValues === "string" && formValues.trim().length > 0) {
      country = formValues.trim().toLowerCase();
    } else if (formValues && typeof formValues === "object") {
      if (typeof formValues.country === "string" && formValues.country.trim().length > 0) {
        country = formValues.country.trim().toLowerCase();
      } else if (formValues.country && typeof formValues.country === "object" && formValues.country.code) {
        country = String(formValues.country.code).trim().toLowerCase();
      } else if (typeof formValues.value === "string" && formValues.value.trim().length > 0) {
        country = formValues.value.trim().toLowerCase();
      }
    }

    const storageKey = `channels_${country}`;
    let channels = null;

    // 1. Try to read from byos.storage collection / key
    try {
      if (typeof byos !== "undefined" && byos.storage) {
        if (typeof byos.storage.getCollection === "function") {
          const col = await byos.storage.getCollection(storageKey);
          if (Array.isArray(col) && col.length > 0) {
            channels = col;
          }
        }
        if (!channels && typeof byos.storage.get === "function") {
          const val = await byos.storage.get(storageKey);
          if (Array.isArray(val) && val.length > 0) {
            channels = val;
          }
        }
      }
    } catch (_) {}

    // 2. If not in storage, fetch from iptv-org repository
    if (!channels || channels.length === 0) {
      const url = `https://raw.githubusercontent.com/iptv-org/iptv/master/streams/${country}.m3u`;
      if (typeof logger !== "undefined") {
        logger.log(`[byos-iptv] Fetching remote M3U playlist from ${url}...`);
      }
      try {
        const res = await fetch(url);
        if (res.ok || res.status === 200) {
          const text = await res.text();
          channels = parseM3U(text, country.toUpperCase());
          if (typeof logger !== "undefined") {
            logger.log(`[byos-iptv] Parsed ${channels.length} channels for country: ${country}`);
          }
          if (channels.length > 0 && typeof byos !== "undefined" && byos.storage) {
            if (typeof byos.storage.setCollection === "function") {
              await byos.storage.setCollection(storageKey, channels);
            }
            if (typeof byos.storage.set === "function") {
              await byos.storage.set(storageKey, channels);
            }
          }
        }
      } catch (err) {
        if (typeof logger !== "undefined") {
          logger.error(`[byos-iptv] Failed to fetch channels for country ${country}:`, err && err.message ? err.message : String(err));
        }
        channels = [];
      }
    }

    if (!Array.isArray(channels)) {
      channels = [];
    }

    // 3. Map to dynamic select option contract: { label, value: { id, name, logo, url, streams, group } }
    return channels.map(ch => {
      const channelObj = {
        id: ch.id || (ch.name ? ch.name.toLowerCase().replace(/[^a-z0-9]/g, "_") : "ch"),
        name: ch.name || ch.title || "Live Channel",
        title: ch.title || ch.name || "Live Channel",
        logo: ch.logo || ch.poster || "",
        poster: ch.poster || ch.logo || "",
        group: ch.group || country.toUpperCase(),
        url: ch.streamUrl || ch.url || "",
        streamUrl: ch.streamUrl || ch.url || "",
        streams: Array.isArray(ch.streams) && ch.streams.length > 0 ? ch.streams : [
          {
            name: `${ch.name || ch.title || "Live Channel"} Live Feed`,
            url: ch.streamUrl || ch.url || "",
            format: "hls",
            quality: "1080p",
            headers: ch.headers || {}
          }
        ]
      };

      return {
        label: channelObj.name,
        value: channelObj
      };
    });
  },

  /**
   * Fetches, aggregates and deduplicates channels across configured sources or user selected channels.
   * If `settings.selected_channels` is present, returns them directly for 0ms instant catalog.
   *
   * @param {Object} [settings] Plugin settings from form schema
   * @returns {Promise<Array<Object>>} List of normalized Live TV channels
   */
  async getChannels(settings) {
    const s = settings || (typeof byos !== "undefined" && byos.settings) || {};

    // 1. Instant 0ms playback: If user has explicitly selected channels in settings
    if (s && Array.isArray(s.selected_channels) && s.selected_channels.length > 0) {
      const selected = [];
      for (let i = 0; i < s.selected_channels.length; i++) {
        const item = s.selected_channels[i];
        if (!item) continue;

        if (typeof item === "object") {
          const streamUrl = item.streamUrl || item.url || (Array.isArray(item.streams) && item.streams[0] && item.streams[0].url) || "";
          selected.push({
            id: item.id || (item.name ? item.name.toLowerCase().replace(/[^a-z0-9]/g, "_") : `ch_${i}`),
            name: item.name || item.title || "Live Channel",
            title: item.title || item.name || "Live Channel",
            logo: item.logo || item.poster || "",
            poster: item.poster || item.logo || "",
            group: item.group || "Favorites",
            url: streamUrl,
            streamUrl: streamUrl,
            streams: Array.isArray(item.streams) && item.streams.length > 0 ? item.streams : [
              {
                name: `${item.name || item.title || "Live Channel"} Live Feed`,
                url: streamUrl,
                format: "hls",
                quality: "1080p",
                headers: item.headers || {}
              }
            ]
          });
        }
      }

      // Merge any custom user M3U sources if specified
      if (Array.isArray(s.sources) && s.sources.length > 0) {
        const customTasks = s.sources
          .filter(src => src && src.enabled !== false)
          .map(src => fetchSource(src));
        const results = await Promise.allSettled(customTasks);
        for (const res of results) {
          if (res.status === "fulfilled" && Array.isArray(res.value)) {
            selected.push(...res.value);
          }
        }
      }

      if (selected.length > 0) {
        return selected;
      }
    }

    const autoReloadHours = (s && typeof s.auto_reload_hours === "number")
      ? s.auto_reload_hours
      : DEFAULT_AUTO_RELOAD_HOURS;

    const forceRefresh = Boolean(s && (s.forceRefresh || s.force_refresh));
    const ttlMs = autoReloadHours > 0 ? (autoReloadHours * 3600 * 1000) : 0;

    // 2. Return cached channels if valid
    if (!forceRefresh) {
      const cachedChannels = await getStorageCache(ttlMs);
      if (cachedChannels && cachedChannels.length > 0) {
        return cachedChannels;
      }
    }

    // 3. Fallback: Fetch country playlist (default 'vn') + any configured sources
    const country = (s && typeof s.country === "string" && s.country.trim())
      ? s.country.trim().toLowerCase()
      : "vn";

    const defaultSource = {
      name: `IPTV.org (${country.toUpperCase()})`,
      source_type: "custom",
      url: `https://raw.githubusercontent.com/iptv-org/iptv/master/streams/${country}.m3u`,
      enabled: true
    };

    const sources = (s && Array.isArray(s.sources) && s.sources.length > 0)
      ? [defaultSource, ...s.sources]
      : [defaultSource];

    const fetchTasks = sources
      .filter(s => s && s.enabled !== false)
      .map(s => fetchSource(s));

    const results = await Promise.allSettled(fetchTasks);

    const allChannels = [];
    const seenKeys = {};

    for (let r = 0; r < results.length; r++) {
      const res = results[r];
      if (res.status === "fulfilled" && Array.isArray(res.value)) {
        for (let c = 0; c < res.value.length; c++) {
          const ch = res.value[c];
          const dedupeKey = `${ch.name}::${ch.streamUrl}`;
          if (!seenKeys[dedupeKey]) {
            seenKeys[dedupeKey] = true;
            allChannels.push(ch);
          }
        }
      }
    }

    // 4. Persist into byos.storage cache
    await setStorageCache(allChannels);

    return allChannels;
  },

  /**
   * Resolves playable streams for a specific channel.
   * Checks settings.selected_channels and cache first to avoid redundant network roundtrips.
   *
   * @param {Object|string} args Query args or channel ID (supports args.id, args.tmdbId, args.name)
   * @returns {Promise<Array<Object>>} List of stream objects
   */
  async getStreams(args) {
    let channelId = "";
    let settings = null;
    let directUrl = "";
    let directStreams = null;

    if (args && typeof args === "object") {
      channelId = String(args.id || args.tmdbId || args.name || args.title || "");
      settings = args.settings || null;
      directUrl = args.streamUrl || args.url || "";
      directStreams = args.streams || null;
    } else if (typeof args === "string") {
      channelId = args;
    }

    // 1. Direct stream payload in args
    if (Array.isArray(directStreams) && directStreams.length > 0) {
      return directStreams;
    }
    if (directUrl) {
      return [
        {
          name: `${(args && (args.name || args.title)) || "Live Channel"} Live Feed`,
          url: directUrl,
          format: "hls",
          quality: "1080p"
        }
      ];
    }

    const normalizedQuery = channelId.trim().toLowerCase();

    // 2. Check settings.selected_channels
    if (settings && Array.isArray(settings.selected_channels)) {
      const matched = settings.selected_channels.find(c => {
        if (!c) return false;
        const cId = String(c.id || "").toLowerCase();
        const cName = String(c.name || "").toLowerCase();
        const cTitle = String(c.title || "").toLowerCase();
        return cId === normalizedQuery || cName === normalizedQuery || cTitle === normalizedQuery;
      });

      if (matched) {
        if (Array.isArray(matched.streams) && matched.streams.length > 0) {
          return matched.streams;
        }
        const sUrl = matched.streamUrl || matched.url;
        if (sUrl) {
          return [
            {
              name: `${matched.name || matched.title || "Live Channel"} Live Feed`,
              url: sUrl,
              format: "hls",
              quality: "1080p"
            }
          ];
        }
      }
    }

    // 3. Try to find in cache first without re-fetching
    const cachedChannels = await getStorageCache(0);
    let channels = cachedChannels;

    // 4. If no cache, perform fresh fetch
    if (!channels || channels.length === 0) {
      channels = await this.getChannels(settings);
    }

    let matched = (channels || []).find(c => {
      if (!c) return false;
      const cId = String(c.id || "").toLowerCase();
      const cName = String(c.name || "").toLowerCase();
      const cTitle = String(c.title || "").toLowerCase();
      return cId === normalizedQuery || cName === normalizedQuery || cTitle === normalizedQuery;
    });

    // 5. If not found in cache, re-fetch once
    if (!matched && cachedChannels) {
      channels = await this.getChannels({ ...settings, forceRefresh: true });
      matched = (channels || []).find(c => {
        if (!c) return false;
        const cId = String(c.id || "").toLowerCase();
        const cName = String(c.name || "").toLowerCase();
        const cTitle = String(c.title || "").toLowerCase();
        return cId === normalizedQuery || cName === normalizedQuery || cTitle === normalizedQuery;
      });
    }

    if (matched && Array.isArray(matched.streams) && matched.streams.length > 0) {
      return matched.streams;
    }

    if (matched && matched.streamUrl) {
      return [
        {
          name: `${matched.name} Live Feed`,
          url: matched.streamUrl,
          format: "hls",
          quality: "1080p"
        }
      ];
    }

    return [];
  },

  /**
   * BYOS 4-Primitives stream resolver alias
   */
  async stream(mediaId, episodeId, settings) {
    if (typeof mediaId === "object" && mediaId !== null) {
      return await this.getStreams(mediaId);
    }
    return await this.getStreams({ id: mediaId, settings });
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = byosPlugin;
}
