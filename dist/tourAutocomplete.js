(() => {
  // src/tourAutocomplete.ts
  var AUTOCOMPLETE_ELEM = "wfu-autocomplete";
  var AUTOCOMPLETE_LIST = "wfu-autocomplete-list";
  var AUTOCOMPLETE_MATCH = "wfu-autocomplete-match";
  var AUTOCOMPLETE_SEARCH = "wfu-autocomplete-search";
  var TourAutocomplete = class {
    constructor() {
    }
    init() {
      this.setupListeners();
    }
    setupListeners() {
      const inputElement = document.querySelector(`[${AUTOCOMPLETE_ELEM}]`);
      if (inputElement) {
        inputElement.addEventListener("input", () => {
          this.displayMatchingElements(inputElement.value);
        });
      } else {
        console.error("no input element found for tour search.");
      }
      const searchElement = document.querySelector(`[${AUTOCOMPLETE_SEARCH}]`);
      if (searchElement) {
        searchElement.addEventListener("click", () => {
          this.siteSearch(inputElement.value);
        });
      }
    }
    siteSearch(matchingString) {
      const query = encodeURIComponent(matchingString);
      const url = `/search?query=${query}`;
      window.location.href = url;
    }
    displayMatchingElements(matchingString) {
      const listElement = document.querySelector(`[${AUTOCOMPLETE_LIST}]`);
      const lowerCaseMatchingString = matchingString.toLowerCase();
      const elements1 = document.querySelectorAll(`[${AUTOCOMPLETE_LIST}] [${AUTOCOMPLETE_MATCH}]`);
      elements1.forEach((element) => {
        element.style.display = "none";
      });
      const elements = document.querySelectorAll(`[${AUTOCOMPLETE_LIST}] [${AUTOCOMPLETE_MATCH}]`);
      elements.forEach((element) => {
        const attributeValue = element.getAttribute(AUTOCOMPLETE_MATCH)?.toLowerCase();
        console.log(lowerCaseMatchingString, attributeValue);
        if (attributeValue && attributeValue.includes(lowerCaseMatchingString)) {
          element.style.display = "block";
        }
      });
    }
  };
})();
//# sourceMappingURL=tourAutocomplete.js.map
