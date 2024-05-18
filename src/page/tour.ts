
/*
 * Page | Tour
 * https://codepen.io/memetican/pen/WNWPoJq/dad2a4c9f1ed011aaefa61f6853a5659
 */

import gsap from 'gsap'; 
 

export class TourPage {

//  modelDropdown: WebflowDropdown; 

  constructor() {
  }
  
  init() {

    console.log("Tour."); 

    window.addEventListener('message', function(event: MessageEvent) { 

      // Check the origin to ensure the message is from a trusted source
      console.log("event received");
      console.log(event.data); 
      
      // if (event.origin !== "https://example.com") {
      //   console.log('The message was not sent from a trusted source!');
      //   return;
      // }
    
      // Fix event data
      if(event.data.type == 'Enquiry')
        event.data.numberOfPeople = '1';
      event.data.childPrice = '100';

      console.log(event.data); 

      /**
       * Apply tour data
       */

      const { date, numberOfPeople } = event.data;
      
      // Check if the values exist and are of the expected types
      if (typeof date === 'string' && typeof numberOfPeople === 'string') {
        const bookingTypeElement = document.getElementById('booking-type') as HTMLSelectElement | null;
        const dateElement = document.getElementById('tour-date') as HTMLInputElement | null;
        const peopleElement = document.getElementById('adults') as HTMLInputElement | null;

        // Verify setup
        if (!(bookingTypeElement && dateElement && peopleElement)) {
          console.log('One or more form elements were not found!');
          return;
        }
    
        dateElement.value = date;
        peopleElement.value = numberOfPeople;
        peopleElement.min = numberOfPeople;

        bookingTypeElement.disabled = false;
        switch(event.data.type) {
          case 'Book Tour Now':
            bookingTypeElement.value = 'Booking'; 
            break;
          case 'Enquiry':
            bookingTypeElement.value = 'Enquiry'; 
            bookingTypeElement.disabled = true;
            break;
        }

      } else {
        console.log('Received data is not in the expected format!');
      }
    }, false);
    
    // window.addEventListener('message', function(event) {
    //   // Check the origin to ensure the message is from a trusted source
    
    //   console.log("event received1");
  
    //   console.log(event.data); 
      
    //   /*
    //     if (event.origin !== "https://example.com") {
    //         console.log('The message was not sent from a trusted source!');
    //         return;
    //     }
    // */
    //     var date = event.data.date;
    //     var numberOfPeople = event.data.numberOfPeople;
    
    //     // Now you can use these values to set the form fields
    //     document.getElementById('tour-date').value = date;
    //     document.getElementById('adults').value = numberOfPeople;

    // }, false);

    // const elements: NodeListOf<Element> = document.querySelectorAll(`.${item.className}`);
    // console.log("Making elements visible", elements);
    // gsap.to(elements, { display: 'block' });


  }

  
  



}
