
/*
 * Page | Home
 */

import gsap from 'gsap'; 
//import fetch from 'node-fetch';
//import * as ipinfo from 'ipinfo';

// Replace with your actual IPinfo token and ExchangeRate-API key
const IPINFO_TOKEN = '37cce46c605631';
const EXCHANGE_RATE_API_KEY = '66103ce28f8033af8f05023e';

async function getVisitorCurrency(): Promise<string> {
  // const response = await fetch(`https://ipinfo.io?token=${IPINFO_TOKEN}`);
  // const data: any = await response.json();
  // console.log(data); 

  return "GBP";

//  return data.currency;
}

async function getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
  const response = await fetch(`https://v6.exchangerate-api.com/v6/${EXCHANGE_RATE_API_KEY}/latest/${fromCurrency}`);
  const data: any = await response.json();
  console.log(data); 
  return data.conversion_rates[toCurrency];
}

async function updatePrices() {
  try {
    const localCurrency = await getVisitorCurrency();
console.log(localCurrency);

    const exchangeRate = await getExchangeRate('NZD', localCurrency);
    console.log('exchangeRate', exchangeRate); 

    const priceElements = document.querySelectorAll('[data-nzd-price]') as NodeListOf<HTMLElement>;

    priceElements.forEach(element => {
      const nzdPrice = parseFloat(element.dataset.nzdPrice || '0');
      const localPrice = (nzdPrice * exchangeRate).toFixed(2);
      element.innerHTML = `${localPrice} ${localCurrency}`;
    });
  } catch (error) {
    console.error('Error updating prices:', error);
  }
}

//document.addEventListener('DOMContentLoaded', updatePrices);


export class TestCurrencyPage {

//  modelDropdown: WebflowDropdown; 

  constructor() {
  }
  
  init() {

    console.log("Home."); 

    updatePrices(); 

    // const elements: NodeListOf<Element> = document.querySelectorAll(`.${item.className}`);
    // console.log("Making elements visible", elements);
    // gsap.to(elements, { display: 'block' });


  }

  
  



}
