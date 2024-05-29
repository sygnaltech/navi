
/*
 * Page | Home
 */

import gsap from 'gsap'; 
 

export class TestAutocompletePage {

//  modelDropdown: WebflowDropdown; 

  constructor() {
  }
  
  WFU_AUTOCOMPLETE = "wfu-autocomplete"; 
  MATCH = "wfu-autocomplete-match"; 
  LIST = "wfu-autocomplete-list";

  init() {

    console.log("Test Autocomplete."); 

    this.setupInputListener(); 
    this.displayMatchingElements(""); 
    
  }

  private setupInputListener(): void {
    // Find the input element with the custom attribute
    const inputElement = document.querySelector(`[${this.WFU_AUTOCOMPLETE}]`) as HTMLInputElement;
    if (inputElement) {
      // Add event listener for input changes
      inputElement.addEventListener('input', () => {
        this.displayMatchingElements(inputElement.value);
      });
    }
  }

  displayMatchingElements(matchingString: string) {

    // Get the list element with the custom attribute
    const listElement = document.querySelector(`[${this.LIST}]`) as HTMLElement;
    
    // Show or hide the list element based on the input content
    if (matchingString.trim() === "") {
      listElement.style.display = 'none';
      return; // No need to continue if the input is empty
    } else {
      listElement.style.display = 'block';
    }

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
