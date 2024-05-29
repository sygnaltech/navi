
/*
 * Component | Tour Autocomplete
 */

import gsap from 'gsap'; 
 

export class TourAutocomplete {

//  modelDropdown: WebflowDropdown; 

  constructor() {
  }
  
  WFU_AUTOCOMPLETE = "wfu-autocomplete"; 
  LIST = "wfu-autocomplete-list"; 
  MATCH = "wfu-autocomplete-match"; 
  SEARCH = "wfu-autocomplete-search";

  init() {

    this.setupListeners(); 
//    this.displayMatchingElements(""); 
    
  }

  private setupListeners(): void {
    // Find the input element with the custom attribute
    const inputElement = document.querySelector(`[${this.WFU_AUTOCOMPLETE}]`) as HTMLInputElement;
    if (inputElement) {
      // Add event listener for input changes
      inputElement.addEventListener('input', () => {
        this.displayMatchingElements(inputElement.value);
      });
    } else {
      console.error("no input element found for tour search."); 
//      return;
      // error
    }

    // Find the input element with the custom attribute
    const searchElement = document.querySelector(`[${this.SEARCH}]`) as HTMLLinkElement;
    if (searchElement) {
      // Add event listener for input changes
      searchElement.addEventListener('click', () => {
        this.siteSearch(inputElement.value);
      });
    }

  }

  siteSearch(matchingString: string): void {
    const query = encodeURIComponent(matchingString);
    const url = `/search?query=${query}`;
    window.location.href = url;
  }
  
  displayMatchingElements(matchingString: string) {

// console.log("updating", matchingString); 

// TODO: ensure it's visible

    // Get the list element with the custom attribute
    const listElement = document.querySelector(`[${this.LIST}]`) as HTMLElement;
    
    // Show or hide the list element based on the input content
    // if (matchingString.trim() === "") {
    //   listElement.style.display = 'none';
    //   return; // No need to continue if the input is empty
    // } else {
    //   listElement.style.display = 'block';
    // }

    // Convert the matching string to lowercase for case-insensitive comparison
    const lowerCaseMatchingString = matchingString.toLowerCase();
  
    // Get all elements with the custom attribute and hide them initially
    const elements1: NodeListOf<Element> = document.querySelectorAll(`[${this.LIST}] [${this.MATCH}]`);
    elements1.forEach(element => {
      (element as HTMLElement).style.display = 'none';
    });
  
    // Get all elements with the custom attribute
    const elements = document.querySelectorAll(`[${this.LIST}] [${this.MATCH}]`);
  
    // Loop through all elements and check if the attribute value contains the matching string (case-insensitive)
    elements.forEach(element => {
      const attributeValue = element.getAttribute(this.MATCH)?.toLowerCase();
      console.log(lowerCaseMatchingString, attributeValue);
      if (attributeValue && attributeValue.includes(lowerCaseMatchingString)) {
        // If it matches, set display to block
        (element as HTMLElement).style.display = 'block';
      }
    });
  }

}
