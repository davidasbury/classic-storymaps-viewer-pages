(function() {
  "use strict";

  var viewerPath = String(window.location.pathname || "").match(/^(.*?\/viewers)(?:\/.*)?$/i);
  var BASE_PATH = viewerPath ? viewerPath[1] : "/viewers";
  var SITE_BASE_PATH = BASE_PATH.slice(0, -"/viewers".length);
  var LEGACY_BASE_PATHS = [SITE_BASE_PATH + "/templates/classic-storymaps"];

  var APP_REGISTRY = {
    maptour: {
      runtimeFolder: "maptour",
      label: "Map Tour",
      demoType: "Story Map Tour",
      classifyFragments: ["story map tour", "storymaptour", "maptour"]
    },
    swipe: {
      runtimeFolder: "swipe",
      label: "Swipe",
      demoType: "Story Map Swipe",
      classifyFragments: ["story map swipe", "story map spyglass", "storymapswipe", "storymapspyglass", "mapswipe", "mapspyglass", "swipespyglass"]
    },
    mapjournal: {
      runtimeFolder: "mapjournal",
      label: "Map Journal",
      demoType: "Story Map Journal",
      classifyFragments: ["story map journal", "storymapjournal", "mapjournal"]
    },
    mapseries: {
      runtimeFolder: "mapseries",
      label: "Map Series",
      demoType: "Story Map Series",
      classifyFragments: ["story map series", "storymapseries", "mapseries"]
    },
    cascade: {
      runtimeFolder: "cascade",
      label: "Cascade",
      demoType: "Story Map Cascade",
      classifyFragments: ["story map cascade", "storymapcascade", "mapcascade"]
    },
    shortlist: {
      runtimeFolder: "shortlist",
      label: "Shortlist",
      demoType: "Story Map Shortlist",
      classifyFragments: ["story map shortlist", "storymapshortlist", "mapshortlist", "shortlist"]
    },
    crowdsource: {
      runtimeFolder: "crowdsource",
      label: "Crowdsource",
      demoType: "Story Map Crowdsource",
      classifyFragments: ["story map crowdsource", "storymapcrowdsource", "mapcrowdsource", "crowdsource"]
    },
    basic: {
      runtimeFolder: "basic",
      label: "Basic",
      demoType: "Story Map Basic",
      classifyFragments: ["story map basic", "storymapbasic", "mapbasic"]
    }
  };

  var CATALOG_APPS = [
    {
      runtime: "maptour",
      title: "Classic Story Map Tour",
      state: "supported",
      description: "Sequential place-based story format linking photos and captions to map locations.",
      image: "assets/images/map-tour.png",
      launchRoute: "maptour-launcher.html",
      action: "Open Launcher"
    },
    {
      runtime: "swipe",
      title: "Classic Story Map Swipe",
      state: "supported",
      description: "Map comparison experience with slider and spyglass patterns.",
      image: "assets/images/swipe.jpg",
      launchRoute: "swipe-launcher.html",
      action: "Open Launcher"
    },
    {
      runtime: "mapjournal",
      title: "Classic Story Map Journal",
      state: "supported",
      description: "Narrative panel plus map canvas with guided launch support for canonical appid routes.",
      image: "assets/images/map-journal.jpg",
      launchRoute: "mapjournal-launcher.html",
      action: "Open Launcher"
    },
    {
      runtime: "mapseries",
      title: "Classic Story Map Series (Tabbed, Bulleted or Side Accordion Layout)",
      state: "supported",
      description: "Tabbed sequence of maps and narrative content.",
      image: "assets/images/map-series-tabbed-viewer.jpg",
      launchRoute: "mapseries-launcher.html",
      action: "Open Launcher"
    },
    {
      runtime: "cascade",
      title: "Story Map Cascade",
      state: "supported",
      description: "Immersive long-form layout combining maps, media, and narrative sections.",
      image: "assets/images/cascade.jpg",
      launchRoute: "cascade-launcher.html",
      action: "Open Launcher"
    },
    {
      runtime: "shortlist",
      title: "Classic Story Map Shortlist",
      state: "supported",
      description: "Themed place list with map-extent aware tab behavior.",
      image: "assets/images/shortlist.jpg",
      launchRoute: "shortlist-launcher.html",
      action: "Open Launcher"
    },
    {
      runtime: "crowdsource",
      title: "Story Map Crowdsource",
      state: "supported",
      description: "View existing crowdsourced photos and stories in a map and gallery. Contributions and editing are disabled.",
      image: "assets/images/crowdsource.jpg",
      launchRoute: "crowdsource-launcher.html",
      action: "Open Launcher"
    },
    {
      runtime: "basic",
      title: "Classic Story Map Basic",
      state: "supported",
      description: "Minimal map-first viewer with optional title and legend.",
      image: "assets/images/basic.jpg",
      launchRoute: "basic-launcher.html",
      action: "Open Launcher"
    }
  ];

  var EXAMPLE_STORIES = {
    maptour: [
      ['016c31c6dcd54c7ca635cc63e4bc82a4', 'Epic Flight'],
      ['d79e17055aa14e119c9c6e8621b23a6a', 'Monuments Men']
    ],
    swipe: [
      ['5c851a0bd60d42f0b2955966ee933465', 'Swipe to the Past: Washington DC 1851 and Today'],
      ['4e44be0f61094d6ab36a1a1df215daed', 'The Linked Burdens of Obesity and Diabetes']
    ],
    mapjournal: [
      ['68affb679afc40718babf3493927b4ac', 'The Great In-Between'],
      ['86b78bfd59a0405bba1540eb9ecbffb1', 'There are Riches Here.']
    ],
    mapseries: [
      ['79798a56715c4df183448cc5b7e1b999', 'A Nation of Drones'],
      ['167ca9b1c85e4c7ea5eac8c6be43358b', 'Favorite Places: Paris Cafes']
    ],
    cascade: [
      ['dbc3574e3d0d4f4a81ae95f2e86b0dc2', 'Palau'],
      ['f2e8448fef064238ace4f324ffc16fde', 'Remembering Rupert'],
      ['9497dbc933bc46efacc5236722cebde6', 'Seeing Green Infrastructure']
    ],
    shortlist: [
      ['0584dbad6ebf433a96f1111f4cc7e3bd', 'San Diego Shortlist'],
      ['5a9c34acf59a49f0a67d5f7293b44d6b', 'The Raised Bogs of Ireland'],
      ['62eef62250984b188b7512ec8f1caadb', 'Palm Springs Shortlist']
    ],
    crowdsource: [
      ['467eccf026ca416cae01a2c6f086b2b9', 'The 2016 Esri UC Selfie Story Map'],
      ['f1fcc302b0864b0c94beffc5177da2b8', 'San Diego Cool'],
      ['b861ca9ea1114af7908600022ee9d033', 'Chicago HomeStories']
    ],
    basic: [
      ['ef329532de2645239789978efe531f3b', 'Brazil: World Cup Stadiums and Interesting Places'],
      ['30066075caa947178f6c2ae438e7efa4', 'Wildlife Strikes by Month']
    ]
  };
  Object.keys(EXAMPLE_STORIES).forEach(function(runtime) {
    EXAMPLE_STORIES[runtime] = EXAMPLE_STORIES[runtime].map(function(example) {
      return { id: example[0], title: example[1], runtime: runtime, image: 'assets/images/examples/' + example[0] + '.jpg' };
    });
  });

  function getRuntimeViewerByApp() {
    var map = {};
    Object.keys(APP_REGISTRY).forEach(function(runtime) {
      var entry = APP_REGISTRY[runtime];
      map[runtime] = BASE_PATH + "/" + entry.runtimeFolder + "/index.html";
    });
    return map;
  }

  function classifyClassicRuntimeFromItem(item) {
    var keywords = (Array.isArray(item && item.typeKeywords) ? item.typeKeywords : [])
      .concat(Array.isArray(item && item.tags) ? item.tags : []);
    var normalizedKeywords = keywords.map(function(keyword) {
      return String(keyword || "").toLowerCase();
    });
    var itemType = String((item && item.type) || "").toLowerCase();
    var itemUrl = String((item && item.url) || "").toLowerCase();
    if (itemType !== "web mapping application") return null;
    var itemPath = "";
    if (itemUrl) {
      try {
        var parsedUrl = new URL(itemUrl);
        if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) return null;
        itemPath = parsedUrl.pathname;
        if (/\/apps\/(?:instant|dashboards|experiencebuilder|webappviewer)(?:\/|$)/.test(itemPath)
          || /^(?:storymaps|experience)\.arcgis\.com$/.test(parsedUrl.hostname)) return null;
      } catch (_) { return null; }
    }

    function hasFragment(fragment) {
      return normalizedKeywords.some(function(keyword) {
        return keyword.indexOf(fragment) !== -1;
      });
    }

    function hasAny(fragments) {
      for (var i = 0; i < fragments.length; i += 1) {
        if (hasFragment(fragments[i])) {
          return true;
        }
      }
      return false;
    }

    var runtimes = Object.keys(APP_REGISTRY);
    var matches = runtimes.filter(function(runtime) { return hasAny(APP_REGISTRY[runtime].classifyFragments); });
    if (matches.length > 1) return null;
    if (matches.length === 1) return matches[0];
    var urlMatches = runtimes.filter(function(runtime) {
      return itemPath.indexOf("/" + APP_REGISTRY[runtime].runtimeFolder + "/") !== -1
        || runtime === "basic" && /\/apps\/(?:onepane\/storytelling_basic|storytellingtextlegend)(?:\/|$)/.test(itemPath);
    });
    if (urlMatches.length > 1) return null;
    if (urlMatches.length === 1) return urlMatches[0];

    if (itemType === "web mapping application" && hasFragment("story map")) {
      return "unknown-classic";
    }

    return null;
  }

  window.ClassicStoryMapsConfig = {
    basePath: BASE_PATH,
    legacyBasePaths: LEGACY_BASE_PATHS,
    appRegistry: APP_REGISTRY,
    catalogApps: CATALOG_APPS,
    exampleStoriesByRuntime: EXAMPLE_STORIES,
    archiveDiscovery: { endpoint: '', allowedOrigins: [] },
    gallery: {
      publicGroupId: '',
      converter: {
        enabled: false,
        url: 'https://regal-sable-0a6dde.netlify.app/',
        runtimes: ['maptour', 'mapjournal', 'mapseries', 'cascade', 'swipe']
      }
    },
    runtimeViewerByApp: getRuntimeViewerByApp(),
    classifyClassicRuntimeFromItem: classifyClassicRuntimeFromItem
  };
})();
