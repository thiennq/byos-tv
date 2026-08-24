/**
 * BYOS Universal Plugin: IPTV Live Streamer
 * Version: 1.0.0
 * Protocol: BYOS Universal JS ES2023 ($0 Server)
 * Description: Trình phát Live TV đa nguồn hỗ trợ IPTV.org và custom M3U/M3U8 playlists.
 */

var PRESET_URLS = {
  iptv_org_vn: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/vn.m3u",
  iptv_org_sports: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/sports.m3u",
  iptv_org_news: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/news.m3u"
};

var DEFAULT_SOURCES = [
  {
    name: "IPTV.org Vietnam",
    source_type: "builtin",
    preset_id: "iptv_org_vn",
    enabled: true
  }
];

function parseM3U(m3uContent, defaultGroup) {
  var channels = [];
  if (!m3uContent || typeof m3uContent !== 'string') {
    return channels;
  }

  var lines = m3uContent.split(/\r?\n/);
  var currentChannel = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      currentChannel = {
        id: '',
        name: '',
        logo: '',
        group: defaultGroup || 'General',
        streamUrl: '',
        streams: []
      };

      // Extract tvg-id
      var idMatch = line.match(/tvg-id="([^"]*)"/i);
      if (idMatch && idMatch[1]) {
        currentChannel.id = idMatch[1];
      }

      // Extract tvg-name
      var nameMatch = line.match(/tvg-name="([^"]*)"/i);
      if (nameMatch && nameMatch[1]) {
        currentChannel.name = nameMatch[1];
      }

      // Extract tvg-logo
      var logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      if (logoMatch && logoMatch[1]) {
        currentChannel.logo = logoMatch[1];
      }

      // Extract group-title
      var groupMatch = line.match(/group-title="([^"]*)"/i);
      if (groupMatch && groupMatch[1]) {
        currentChannel.group = groupMatch[1];
      }

      // Extract channel display title after comma
      var commaIdx = line.lastIndexOf(',');
      if (commaIdx !== -1) {
        var title = line.substring(commaIdx + 1).trim();
        if (title && !currentChannel.name) {
          currentChannel.name = title;
        }
      }

      if (!currentChannel.id && currentChannel.name) {
        currentChannel.id = currentChannel.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      }
    } else if (!line.startsWith('#') && currentChannel) {
      // Stream URL line
      currentChannel.streamUrl = line;
      currentChannel.url = line;
      currentChannel.title = currentChannel.name;
      currentChannel.poster = currentChannel.logo;
      currentChannel.streams = [
        {
          name: currentChannel.name + " Live Feed",
          url: line,
          format: "hls",
          quality: "1080p"
        }
      ];

      if (currentChannel.name && currentChannel.streamUrl) {
        channels.push(currentChannel);
      }
      currentChannel = null;
    }
  }

  return channels;
}

var byosPlugin = {
  id: "byos.plugin.iptv",
  name: "IPTV Live Streamer",
  version: "1.0.0",
  author: "BYOS Ecosystem",
  description: "Trình phát Live TV đa nguồn hỗ trợ danh mục IPTV.org & Custom M3U/M3U8",
  supportedMedia: ["live_tv"],

  formSchema: {
    title: "Cấu Hình Danh Sách Kênh Live TV",
    description: "Quản lý nguồn phát truyền hình trực tuyến và làm mới danh sách kênh",
    fields: [
      {
        key: "auto_reload_hours",
        label: "Tự động làm mới danh mục (giờ)",
        type: "select",
        default: 24,
        options: [
          { label: "Mỗi 6 tiếng", value: 6 },
          { label: "Mỗi 24 tiếng", value: 24 },
          { label: "Không tự động làm mới", value: 0 }
        ]
      },
      {
        key: "sources",
        label: "Danh Sách Nguồn Kênh",
        type: "list",
        itemTitle: "{name}",
        default: DEFAULT_SOURCES,
        itemSchema: [
          {
            key: "source_type",
            label: "Loại Nguồn",
            type: "select",
            default: "builtin",
            options: [
              { label: "Nguồn có sẵn (Built-in Presets)", value: "builtin" },
              { label: "Tùy biến (Custom M3U URL)", value: "custom" }
            ]
          },
          {
            key: "preset_id",
            label: "Chọn Danh Mục Có Sẵn",
            type: "select",
            condition: { field: "source_type", equals: "builtin" },
            default: "iptv_org_vn",
            options: [
              { label: "IPTV.org - Kênh Quốc Gia Việt Nam", value: "iptv_org_vn" },
              { label: "IPTV.org - Kênh Thể Thao Quốc Tế", value: "iptv_org_sports" },
              { label: "IPTV.org - Kênh Tin Tức 24/7", value: "iptv_org_news" }
            ]
          },
          {
            key: "name",
            label: "Tên Nguồn",
            type: "text",
            placeholder: "VD: K+ Nhà Mạng",
            condition: { field: "source_type", equals: "custom" },
            required: true
          },
          {
            key: "url",
            label: "Đường Dẫn M3U / M3U8",
            type: "url",
            placeholder: "https://example.com/playlist.m3u",
            condition: { field: "source_type", equals: "custom" },
            required: true
          },
          {
            key: "enabled",
            label: "Kích hoạt nguồn này",
            type: "boolean",
            default: true
          }
        ]
      }
    ]
  },

  async getChannels(settings) {
    var sources = (settings && Array.isArray(settings.sources) && settings.sources.length > 0)
      ? settings.sources
      : DEFAULT_SOURCES;

    var allChannels = [];
    var seenIds = {};

    for (var i = 0; i < sources.length; i++) {
      var source = sources[i];
      if (source.enabled === false) continue;

      var targetUrl = "";
      if (source.source_type === "builtin") {
        targetUrl = PRESET_URLS[source.preset_id] || PRESET_URLS.iptv_org_vn;
      } else {
        targetUrl = source.url || "";
      }

      if (!targetUrl) continue;

      try {
        var response = await fetch(targetUrl);
        var m3uText = await response.text();
        var parsed = parseM3U(m3uText, source.name || "IPTV");

        for (var j = 0; j < parsed.length; j++) {
          var ch = parsed[j];
          var dedupeKey = ch.name + "::" + ch.streamUrl;
          if (!seenIds[dedupeKey]) {
            seenIds[dedupeKey] = true;
            allChannels.push(ch);
          }
        }
      } catch (err) {
        // Continue to next source if one fails
      }
    }

    return allChannels;
  },

  async getStreams(args) {
    var channelId = (args && (args.tmdbId || args.id)) || '';
    var channels = await this.getChannels(args && args.settings);
    var matched = channels.find(function(c) { return c.id === channelId || c.name === channelId; });

    if (matched && matched.streams) {
      return matched.streams;
    }
    return [];
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = byosPlugin;
}
