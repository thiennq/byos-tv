/**
 * Cinema Sample Pro - Reference Implementation for BYOS TV Plugins
 * Supports all 4 Primitives: Catalog, Meta, Stream, and Subtitles.
 *
 * Demonstrates:
 * 1. Single Object parameter handling & byos.settings SDK integration
 * 2. Catalog curator for Top Movies & Series
 * 3. Meta detail provider with episode listing
 * 4. Stream extractor with direct MP4/HLS & BingeGroup hints
 * 5. Subtitle provider returning VTT/SRT files
 */

const SAMPLE_MOVIES = [
  {
    id: "sample_sintel",
    name: "Sintel (4K HDR)",
    type: "movie",
    poster: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Sintel_poster.jpg/800px-Sintel_poster.jpg",
    backdrop: "https://durian.blender.org/wp-content/uploads/2010/09/sintel_desktop_1920x1080.jpg",
    releaseInfo: "2010",
    rating: "8.1",
    genres: ["Animation", "Short", "Fantasy"],
    description: "A lonely young woman, Sintel, helps and befriends a baby dragon whom she calls Scales. A journey across a dangerous fantasy world begins.",
    director: ["Colin Levy"],
    cast: ["Halina Reijn", "Thom Hoffman"],
    streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
    subtitles: [
      {
        id: "sub_sintel_vie",
        lang: "vie",
        name: "Tiếng Việt (Chuẩn BluRay)",
        url: "https://raw.githubusercontent.com/byos-tv/subtitles/master/sintel_vi.vtt",
        format: "vtt"
      },
      {
        id: "sub_sintel_eng",
        lang: "eng",
        name: "English [SDH]",
        url: "https://raw.githubusercontent.com/byos-tv/subtitles/master/sintel_en.vtt",
        format: "vtt"
      }
    ]
  },
  {
    id: "sample_tears_of_steel",
    name: "Tears of Steel (VFX Sci-Fi)",
    type: "movie",
    poster: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Tears_of_Steel_poster.jpg/800px-Tears_of_Steel_poster.jpg",
    backdrop: "https://mango.blender.org/wp-content/uploads/2012/09/01_thom_vfx_shot.jpg",
    releaseInfo: "2012",
    rating: "7.5",
    genres: ["Sci-Fi", "VFX", "Action"],
    description: "Set in a dystopian future Amsterdam, a group of scientists and warriors attempt to stage a crucial event in the past to save the world from robots.",
    director: ["Ian Hubert"],
    cast: ["Derek de Lint", "Sergio Hasselbaink"],
    streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
    subtitles: [
      {
        id: "sub_tos_vie",
        lang: "vie",
        name: "Tiếng Việt (Thuyết Minh)",
        url: "https://raw.githubusercontent.com/byos-tv/subtitles/master/tears_vi.vtt",
        format: "vtt"
      }
    ]
  }
];

const SAMPLE_SERIES = [
  {
    id: "sample_cosmos_series",
    name: "Cosmos & Stars Chronicles",
    type: "series",
    poster: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/FullMoon2010.jpg/600px-FullMoon2010.jpg",
    backdrop: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Earth_Eastern_Hemisphere.jpg/1280px-Earth_Eastern_Hemisphere.jpg",
    releaseInfo: "2024",
    rating: "9.2",
    genres: ["Documentary", "Space", "Nature"],
    description: "An awe-inspiring cinematic journey across deep space, planetary physics, and the universe.",
    episodes: [
      {
        id: "sample_cosmos_series:1:1",
        season: 1,
        episode: 1,
        title: "Episode 1: The Cosmic Shores",
        overview: "Voyage to the outer reaches of the known universe and the birth of stars.",
        thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/FullMoon2010.jpg/600px-FullMoon2010.jpg",
        streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
      },
      {
        id: "sample_cosmos_series:1:2",
        season: 1,
        episode: 2,
        title: "Episode 2: The Red Giant",
        overview: "How stellar nucleosynthesis forges elements necessary for organic life.",
        thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Earth_Eastern_Hemisphere.jpg/1280px-Earth_Eastern_Hemisphere.jpg",
        streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4"
      }
    ]
  }
];

const byosPlugin = {
  /**
   * RESOURCE 1A: CATALOGS (Level 1 Discovery)
   * Returns list of catalog shelves available to browse.
   */
  async getCatalogs() {
    return [
      { id: "featured_movies", name: "🎬 Phim Nổi Bật", type: "movie" },
      { id: "cosmos_chronicles", name: "🌌 Phim Tài Liệu Vũ Trụ", type: "series" }
    ];
  },

  /**
   * RESOURCE 1B: CATALOG ITEMS (Level 2 Item Fetching)
   * Returns list of media items in a specific catalog shelf.
   */
  async getCatalogItems(args) {
    const settings = (typeof byos !== "undefined" && byos.settings) || args?.settings || {};
    const mediaType = (args && (args.type || args.catalogType)) || "movie";
    const catalogId = (args && (args.id || args.catalogId)) || "featured_movies";
    const search = (args && (args.query || args.search)) ? String(args.query || args.search).toLowerCase().trim() : "";

    let items = mediaType === "series" ? SAMPLE_SERIES : SAMPLE_MOVIES;

    if (search) {
      items = items.filter(m => m.name.toLowerCase().includes(search) || m.description.toLowerCase().includes(search));
    }

    return items.map(m => ({
      id: m.id,
      name: m.name,
      type: m.type,
      poster: m.poster,
      backdrop: m.backdrop,
      releaseInfo: m.releaseInfo,
      rating: m.rating,
      genres: m.genres,
      description: m.description,
      extra: {
        catalogId: catalogId,
        preferredRes: settings.preferred_resolution || "4k"
      }
    }));
  },

  /**
   * RESOURCE 2: META
   * Returns rich media details, cast, director, and episode hierarchy.
   */
  async getMeta(args) {
    const mediaId = String(args?.id || args?.tmdbId || args?.mediaId || args || "");
    const all = [...SAMPLE_MOVIES, ...SAMPLE_SERIES];
    const item = all.find(m => m.id === mediaId);

    if (!item) {
      return null;
    }

    return {
      id: item.id,
      name: item.name,
      type: item.type,
      poster: item.poster,
      backdrop: item.backdrop,
      description: item.description,
      releaseInfo: item.releaseInfo,
      rating: item.rating,
      genres: item.genres,
      director: item.director || [],
      cast: item.cast || [],
      episodes: item.episodes || []
    };
  },

  /**
   * RESOURCE 3: STREAM
   * Extracts playable video links matching resolution preference.
   */
  async getStreams(args) {
    const settings = (typeof byos !== "undefined" && byos.settings) || args?.settings || {};
    const mediaId = String(args?.id || args?.tmdbId || args?.mediaId || "");
    const season = args?.season;
    const episode = args?.episode;
    const preferredQuality = settings.preferred_resolution || "4k";

    // 1. Check in Movies
    const movie = SAMPLE_MOVIES.find(m => m.id === mediaId);
    if (movie) {
      return [
        {
          title: `Cinema Direct (${preferredQuality.toUpperCase()} Master)`,
          url: movie.streamUrl,
          quality: preferredQuality.toUpperCase(),
          format: "mp4",
          isDirectPlay: true,
          behaviorHints: {
            bingeGroup: "cinema_sample_direct",
            notWebReady: false
          }
        }
      ];
    }

    // 2. Check in TV Series Episodes
    for (const series of SAMPLE_SERIES) {
      if (series.id === mediaId || mediaId.startsWith(series.id)) {
        const ep = (series.episodes || []).find(e => {
          if (season && episode) {
            return e.season === Number(season) && e.episode === Number(episode);
          }
          return e.id === mediaId;
        }) || series.episodes[0];

        if (ep) {
          return [
            {
              title: `${ep.title} (${preferredQuality.toUpperCase()})`,
              url: ep.streamUrl,
              quality: preferredQuality.toUpperCase(),
              format: "mp4",
              isDirectPlay: true,
              behaviorHints: {
                bingeGroup: `cosmos_s${ep.season}`,
                notWebReady: false
              }
            }
          ];
        }
      }
    }

    return [];
  },

  /**
   * RESOURCE 4: SUBTITLES
   * Returns external subtitle tracks for the player.
   */
  async getSubtitles(args) {
    const settings = (typeof byos !== "undefined" && byos.settings) || args?.settings || {};
    const mediaId = String(args?.id || args?.tmdbId || args?.mediaId || "");

    const movie = SAMPLE_MOVIES.find(m => m.id === mediaId);
    if (movie && Array.isArray(movie.subtitles)) {
      return movie.subtitles;
    }

    return [];
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = byosPlugin;
}
