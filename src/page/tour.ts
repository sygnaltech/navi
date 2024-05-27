
/*
 * Page | Tour
 * https://codepen.io/memetican/pen/WNWPoJq/dad2a4c9f1ed011aaefa61f6853a5659
 */

import gsap from 'gsap'; 
import { formatAsCurrency, formatAsNumber } from '../util';
import flatpickr from "flatpickr";
import { TourOrder } from '../tourOrder';

export class TourPage {

//  modelDropdown: WebflowDropdown; 

  constructor() {
  }

  init() {

    console.log("Tour."); 

    console.log((window as any).Tour);

    // Assuming window.Tour is already defined
    const tourAid: boolean = !!((window as any).Tour?.TourAidCode && (window as any).Tour.TourAidCode.trim() !== '');

    console.log("tourAid?", tourAid);


    // Initialize datepickers
    if(tourAid) {
      const tourDateElement = document.getElementById('tour-date') as HTMLInputElement;
      if (tourDateElement) {
        tourDateElement.disabled = true;
      }
    } else
      this.initializeDatepicker("#tour-date", "d M Y");

    this.initializeDatepicker("#arrival-date", "d M Y");
    this.initializeDatepicker("#departure-date", "d M Y");

    this.init_TourAidCalendar();

    // const elements: NodeListOf<Element> = document.querySelectorAll(`.${item.className}`);
    // console.log("Making elements visible", elements);
    // gsap.to(elements, { display: 'block' });
    const bookingTypeElement = document.getElementById('booking-type') as HTMLSelectElement;
    if (bookingTypeElement) {
        bookingTypeElement.addEventListener('change', this.configureForm);
    }

    // Event Listeners for Quantity Changes
    const adultsInput = document.getElementById("adults") as HTMLInputElement;
    const childrenInput = document.getElementById("children") as HTMLInputElement;

    if (adultsInput) {
        adultsInput.addEventListener("keyup", this.calcOrder);
        adultsInput.addEventListener("change", this.calcOrder);
    }

    if (childrenInput) {
        childrenInput.addEventListener("keyup", this.calcOrder);
        childrenInput.addEventListener("change", this.calcOrder);
    }

    this.configureForm();
    this.calcOrder();

    this.init_bookingFormHandler();

  }

  
  init_bookingFormHandler(): void {
  
    // Disable default submit
    document.removeEventListener('submit', (event) => {
      event.preventDefault();
    });

    const bookingForm = document.getElementById('booking-form') as HTMLFormElement;
    if (bookingForm) {
      bookingForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const submitButton = bookingForm.querySelector('[type=submit]') as HTMLInputElement;
        if (!submitButton) return;
        const originalText = submitButton.value;

        // Clear any pre-existing order
        localStorage.removeItem('order');

        const order = this.createOrder();

        // Save order
        localStorage.setItem('order', JSON.stringify(order));

        submitButton.value = submitButton.getAttribute('data-wait') || originalText;

        // Send data to Tour Aid
        const formData = new FormData(bookingForm);
        const action = bookingForm.getAttribute('action') || '';
//        const action = 'https://sygnal-n8n-u1282.vm.elestio.app:5678/webhook-test/5be21ed5-f753-4492-89d3-4d7e1206b9ca';
        const method = bookingForm.getAttribute('method') || 'POST';

        // console.log(order);
        // console.log(formData);

        // Prepare form data for posting
        const params = new URLSearchParams(formData as any);

        // Populate missing fields
        // that are disabled for UX purposes 
        if(!params.has("date")) {
          const dateValue = this.getInputValueById("tour-date");
          if (dateValue !== null) {
              params.append("date", dateValue);
          }
        }
        if (!params.has("booking-type")) {
          const bookingTypeValue = this.getInputValueById("booking-type");
          if (bookingTypeValue !== null) {
              params.append("booking-type", bookingTypeValue);
          }
        }

        // Yes, I need total of adults, children, cc fees and grand TOTAL.
        // Only for calendar-integrated tours is OK.

        if(order) {
          if (!params.has("total")) {
            params.append("total", order.total().toString())
          }
          if (!params.has("totalFees")) {
            params.append("totalFees", order.totalFees()?.toString())
          }
          if (!params.has("totalWithFees")) {
            params.append("totalWithFees", order.totalWithFees()?.toString())
          }

          const adult = order.items.find(e => e.product === "Adult");
          const child = order.items.find(e => e.product === "Child");
    
          if (adult && child) {
            if (!params.has("totalAdults")) {
              params.append("totalAdults", (adult.price * adult.quantity).toString())
            }
            if (!params.has("totalChildren")) {
              params.append("totalChildren", (child.price * child.quantity).toString())
            }
          }

        }

        // Debug
        // params.forEach((value, key) => {
        //   console.log(`${key}: ${value}`);
        // });

        fetch(action, {
          method: method,
          body: params, 
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        })
        .then(response => {
          if (response.ok) {
            // Redirect for response
            const redirectUrl = bookingForm.getAttribute('data-redirect') || '/';
            window.location.href = redirectUrl;
          } else {
            throw new Error('Network response was not ok.');
          }
        })
        .catch(error => {
          // Something went wrong
          const doneElement = bookingForm.querySelector('.w-form-done') as HTMLElement;
          const failElement = bookingForm.querySelector('.w-form-fail') as HTMLElement;
          if (doneElement) doneElement.style.display = 'none';
          if (failElement) failElement.style.display = 'block';
          submitButton.value = originalText;
        });
      });
    }

  }

  
  init_TourAidCalendar() {

    window.addEventListener('message', (event: MessageEvent) => { 

      // Check the origin to ensure the message is from a trusted source
      console.log("event received");
      console.log(event.data); 
      
      // if (event.origin !== "https://example.com") {
      //   console.log('The message was not sent from a trusted source!');
      //   return;
      // }
    
      // HACK: Fix event data
      // if(event.data.type == 'Enquiry')
      //   event.data.numberOfPeople = '1';
//      event.data.childPrice = '100';

//      console.log(event.data); 

      /**
       * Apply tour data
       */

      const { date, numberOfPeople } = event.data;
      
      // Check if the values exist and are of the expected types
      if (typeof date === 'string' && typeof numberOfPeople === 'string') {
        const bookingTypeElement = document.getElementById('booking-type') as HTMLSelectElement | null;
        const dateElement = document.getElementById('tour-date') as HTMLInputElement | null;
//        const peopleElement = document.getElementById('adults') as HTMLInputElement | null;
        const adultPriceInput = document.getElementById('adult-price') as HTMLInputElement;
        const adultQuantityInput = document.getElementById('adults') as HTMLInputElement;
        const childPriceInput = document.getElementById('child-price') as HTMLInputElement;
        const childQuantityInput = document.getElementById('children') as HTMLInputElement;

        // Verify setup
        if (!(bookingTypeElement && dateElement && adultQuantityInput)) {
          console.log('One or more form elements were not found!');
          return;
        }
    
        dateElement.value = date;
        adultQuantityInput.value = numberOfPeople;
        adultQuantityInput.min = numberOfPeople;
        adultPriceInput.value = event.data.price;
        childPriceInput.value = event.data.priceChild;
        bookingTypeElement.disabled = false;

        switch(event.data.type) {
          case 'Book Tour Now':
            bookingTypeElement.value = 'Booking'; 
            this.configureForm();
            break;
          case 'Enquiry':
            bookingTypeElement.value = 'Enquiry'; 
            bookingTypeElement.disabled = true;
            this.configureForm();
            break;
        }

// console.log("CALC again")

        this.calcOrder(); 

      } else {
        console.log('Received data is not in the expected format!');
      }
    }, false);

  }

    configureForm(): void { 

      const formElement = document.getElementById('booking-form') as HTMLFormElement;
      const infoEnquiry = document.getElementById('info-enquiry');
      const infoBooking = document.getElementById('info-booking');
      const infoPayment = document.getElementById('info-payment');
      const submitBtn = document.getElementById('submit-btn') as HTMLInputElement;
      const canPayOnlineElement = document.getElementById('can-pay-online') as HTMLInputElement;
      const bookingTypeElement = document.getElementById('booking-type') as HTMLSelectElement;
    
      if (infoEnquiry) infoEnquiry.style.display = 'none';
      if (infoBooking) infoBooking.style.display = 'none';
      if (infoPayment) infoPayment.style.display = 'none';
    
      const canPayOnline = canPayOnlineElement.value === 'true';
      const bookNow = bookingTypeElement.value === 'Booking';
    
      if (bookNow) {
        submitBtn.value = 'Book Tour Now';
        if (canPayOnline) {
          formElement.setAttribute('data-redirect', '/payment');
          if (infoPayment) infoPayment.style.display = 'block';
        } else {
          formElement.setAttribute('data-redirect', '/thanks');
          if (infoBooking) infoBooking.style.display = 'block';
        }
      } else {
        formElement.setAttribute('data-redirect', '/thanks');
        submitBtn.value = 'Enquire Now';
        if (infoEnquiry) infoEnquiry.style.display = 'block';
      }

    }


  
    initializeDatepicker(selector: string, dateFormat: string): void {
      const element = document.querySelector(selector);
      if (element) {
        flatpickr(element, {
          dateFormat: dateFormat
        });
      }
    }


    // Order Calculation
    calcOrder = (): void => {
//    calcOrder(): void {

      console.log("calculating order"); 

      const order = this.createOrder();
      
      // Find adult and child items
      const adult = order.items.find(e => e.product === "Adult");
      const child = order.items.find(e => e.product === "Child");

      // Ensure the elements exist before accessing their properties
      if (adult && child) {
        const adultQty = document.getElementById("adult-qty");
        const adultTotal = document.getElementById("adult-total");
        const childQty = document.getElementById("child-qty");
        const childTotal = document.getElementById("child-total");
        const fees = document.getElementById("fees");
        const total = document.getElementById("total");

        if (adultQty) adultQty.innerHTML = formatAsNumber(adult.quantity);
        if (adultTotal) adultTotal.innerHTML = formatAsCurrency(adult.price * adult.quantity);
        if (childQty) childQty.innerHTML = formatAsNumber(child.quantity);
        if (childTotal) childTotal.innerHTML = formatAsCurrency(child.price * child.quantity);
        if (fees) fees.innerHTML = formatAsCurrency(order.totalFees());
        if (total) total.innerHTML = formatAsCurrency(order.totalWithFees());
      }

      console.log("test");
    }

    createOrder = (): TourOrder => {
//    createOrder(): TourOrder {
      const order = new TourOrder();

      const customerNameInput = document.getElementById('name') as HTMLInputElement;
      const customerEmailInput = document.getElementById('email') as HTMLInputElement;
      const tourNameElement = document.getElementById('tour') as HTMLElement;
      const tourCodeInput = document.getElementById('tour-code') as HTMLInputElement;
      const tourDateInput = document.getElementById('tour-date') as HTMLInputElement;
      const adultPriceInput = document.getElementById('adult-price') as HTMLInputElement;
      const adultQuantityInput = document.getElementById('adults') as HTMLInputElement;
      const childPriceInput = document.getElementById('child-price') as HTMLInputElement;
      const childQuantityInput = document.getElementById('children') as HTMLInputElement;

      if (customerNameInput) order.customerName = customerNameInput.value;
      if (customerEmailInput) order.customerEmail = customerEmailInput.value;
      if (tourNameElement) order.tourName = tourNameElement.textContent || "";
      if (tourCodeInput) order.tourCode = tourCodeInput.value;
      if (tourDateInput) order.tourDate = tourDateInput.value;

      if (adultPriceInput && adultQuantityInput) {
        order.items.push({
          product: "Adult",
          price: parseFloat(adultPriceInput.value || '0'),
          quantity: parseInt(adultQuantityInput.value || '0', 10)
        });
      }

      if (childPriceInput && childQuantityInput) {
        order.items.push({
          product: "Child",
          price: parseFloat(childPriceInput.value || '0'),
          quantity: parseInt(childQuantityInput.value || '0', 10)
        });
      }

      console.log("order", order);

      return order;
    }


  // Utility function
  getInputValueById(id: string): string | null {
    const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    return element ? element.value : null;
  }





}
