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
        if (event.data.type == "Enquiry")
          event.data.numberOfPeople = "1";
        event.data.childPrice = "100";
        console.log(event.data);
        const { date, numberOfPeople } = event.data;
        if (typeof date === "string" && typeof numberOfPeople === "string") {
          const bookingTypeElement = document.getElementById("booking-type");
          const dateElement = document.getElementById("tour-date");
          const peopleElement = document.getElementById("adults");
          if (!(bookingTypeElement && dateElement && peopleElement)) {
            console.log("One or more form elements were not found!");
            return;
          }
          dateElement.value = date;
          peopleElement.value = numberOfPeople;
          peopleElement.min = numberOfPeople;
          bookingTypeElement.disabled = false;
          switch (event.data.type) {
            case "Book Tour Now":
              bookingTypeElement.value = "Booking";
              break;
            case "Enquiry":
              bookingTypeElement.value = "Enquiry";
              bookingTypeElement.disabled = true;
              break;
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
