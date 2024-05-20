
/*
 * Page | Payment
 */

import gsap from 'gsap'; 
import { TourOrder } from '../tourOrder';
import { formatAsCurrency, formatAsNumber } from '../util';
import { PaypalPayment, WindcavePayment } from '../sa5-commerce';


export class PaymentPage {

//  modelDropdown: WebflowDropdown; 

  constructor() {
  }
  
  init() {

    console.log("Payment Page."); 



    // const elements: NodeListOf<Element> = document.querySelectorAll(`.${item.className}`);
    // console.log("Making elements visible", elements);
    // gsap.to(elements, { display: 'block' });
    const orderJson = localStorage.getItem("order");
    if (!orderJson) return;
  
    const order: TourOrder = Object.assign(new TourOrder(), JSON.parse(orderJson));
    
console.log(order); 

    // Display order detail
    const adult = order.items.find(e => e.product === "Adult");
    const child = order.items.find(e => e.product === "Child");
  
    if (adult && child) {
      const tourElement = document.getElementById("tour");
      const adultQtyElement = document.getElementById("adult-qty");
      const adultTotalElement = document.getElementById("adult-total");
      const childQtyElement = document.getElementById("child-qty");
      const childTotalElement = document.getElementById("child-total");
      const feesElement = document.getElementById("fees");
      const totalElement = document.getElementById("total");
      const btnPayCC = document.getElementById("btn-pay-cc") as HTMLAnchorElement;
      const btnPayPaypal = document.getElementById("btn-pay-paypal") as HTMLAnchorElement;
  
      if (tourElement) tourElement.textContent = order.tourName;
  
      if (adultQtyElement) adultQtyElement.textContent = formatAsNumber(adult.quantity);
      if (adultTotalElement) adultTotalElement.textContent = formatAsCurrency(adult.price * adult.quantity);
      if (childQtyElement) childQtyElement.textContent = formatAsNumber(child.quantity);
      if (childTotalElement) childTotalElement.textContent = formatAsCurrency(child.price * child.quantity);
  
      if (feesElement) feesElement.textContent = formatAsCurrency(order.totalFees());
      if (totalElement) totalElement.textContent = formatAsCurrency(order.totalWithFees());
  
      // Prepare Payment URLs
      const totalWithFees = Number(order.totalWithFees()).toFixed(2);
  
// I use wind cave as a payment mechanism where I create a URL from a client's tour website when a user clicks the link therefore we did four payment I need to know if there is a way to specify where the user should be redirected to after payment is successfully complete 
// https://sec.windcave.com/pxaccess/pxpay/payform?userid=NaviHoldingLtd_PF&amount=762.20&currencyname=NZD&txndata1=Hobbiton%20Movie%20Set%20Tour&txndata2=30%20May%202024&txndata3=undefined&email=undefined

// https://sec.windcave.com/pxaccess/pxpay/payform?userid=NaviHoldingLtd_PF&amount=762.20&currencyname=NZD&txndata1=Hobbiton%20Movie%20Set%20Tour&txndata2=30%20May%202024&txndata3=undefined&email=undefined&urlsuccess=https://yourwebsite.com/success-page


      const payWindcave = new WindcavePayment();
      payWindcave.userid = "NaviHoldingLtd_PF";
      payWindcave.amount = Number(totalWithFees);
      payWindcave.currencyname = "NZD";
      payWindcave.txndata1 = order.tourName;
      payWindcave.txndata2 = order.tourDate;
      payWindcave.txndata3 = order.customerName;
      payWindcave.email = order.customerEmail;
      payWindcave.urlsuccess = "https://www.tournewzealand.com/thanks";

      if (btnPayCC) btnPayCC.href = payWindcave.generateUrl(); 

      const payPaypal = new PaypalPayment();
      payPaypal.business = "info@navi.co.nz";
      payPaypal.amount = Number(totalWithFees);
      payPaypal.currency_code = "NZD";
      payPaypal.item_name = order.tourName;
      payPaypal.return = "https://www.tournewzealand.com/thanks";
  
      if (btnPayPaypal) btnPayPaypal.href = payPaypal.generateUrl();
    }

  }

  
  



}
