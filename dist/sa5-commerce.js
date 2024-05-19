(() => {
  // src/sa5-commerce.ts
  var WindcavePayment = class {
    generateUrl() {
      var hrefBase = "https://sec.windcave.com/pxaccess/pxpay/payform";
      const urlParams = new URLSearchParams();
      urlParams.set("userid", this.userid);
      urlParams.set("amount", Number(this.amount).toFixed(2));
      urlParams.set("currencyname", this.currencyname);
      urlParams.set("txndata1", this.txndata1);
      urlParams.set("txndata2", this.txndata2);
      urlParams.set("txndata3", this.txndata3);
      urlParams.set("email", this.email);
      var newHref = hrefBase + "?" + urlParams.toString();
      newHref = newHref.replace("+", "%20");
      return newHref;
    }
  };
  var PaypalPayment = class {
    generateUrl() {
      var hrefBase = "https://www.paypal.com/cgi-bin/webscr";
      const urlParams = new URLSearchParams();
      urlParams.set("business", this.business);
      urlParams.set("cmd", "_xclick");
      urlParams.set("currency_code", this.currency_code);
      urlParams.set("amount", Number(this.amount).toFixed(2));
      urlParams.set("item_name", this.item_name);
      var newHref = hrefBase + "?" + urlParams.toString();
      return newHref;
    }
  };
})();
//# sourceMappingURL=sa5-commerce.js.map
