(() => {
  // src/page/home.ts
  var HomePage = class {
    constructor() {
    }
    init() {
      console.log("Home.");
    }
  };

  // src/page/tour.ts
  var TourPage = class {
    constructor() {
    }
    init() {
      console.log("Tour.");
      window.addEventListener("message", function(event) {
        console.log("event received");
        console.log(event.data);
        const { date, numberOfPeople } = event.data;
        if (typeof date === "string" && typeof numberOfPeople === "string") {
          const dateElement = document.getElementById("tour-date");
          const peopleElement = document.getElementById("adults");
          if (dateElement && peopleElement) {
            dateElement.value = date;
            peopleElement.value = numberOfPeople;
          } else {
            console.log("One or more form elements were not found!");
          }
        } else {
          console.log("Received data is not in the expected format!");
        }
      }, false);
    }
  };

  // src/routeDispatcher.ts
  var RouteDispatcher = class {
    constructor() {
    }
    matchRoute(path) {
      for (const route in this.routes) {
        if (route.endsWith("*")) {
          const baseRoute = route.slice(0, -1);
          if (path.startsWith(baseRoute)) {
            return this.routes[route];
          }
        } else if (route === path) {
          return this.routes[route];
        }
      }
      return null;
    }
    dispatchRoute() {
      const path = window.location.pathname;
      const handler = this.matchRoute(path);
      if (handler) {
        handler();
      } else {
        console.log("No specific function for this path.");
      }
    }
  };

  // src/index.ts
  var SITE_NAME = "Site";
  var VERSION = "v0.1.0";
  window[SITE_NAME] = window[SITE_NAME] || {};
  var Site = window[SITE_NAME];
  var init = () => {
    console.log(`${SITE_NAME} package init ${VERSION}`);
    var routeDispatcher = new RouteDispatcher();
    routeDispatcher.routes = {
      "/": () => {
        new HomePage().init();
      },
      "/tour/*": () => {
        new TourPage().init();
      }
    };
    routeDispatcher.dispatchRoute();
  };
  document.addEventListener("DOMContentLoaded", init);
})();
//# sourceMappingURL=index.js.map
