(() => {
  // src/tourOrder.ts
  var TourOrder = class {
    constructor() {
      this.processingFees = 0.03;
      this.items = [];
    }
    total() {
      let p = 0;
      for (let i = 0; i < this.items.length; i++) {
        p += this.items[i].price * this.items[i].quantity;
      }
      return p;
    }
    totalFees() {
      return this.total() * this.processingFees;
    }
    totalWithFees() {
      return this.total() + this.totalFees();
    }
    get valid() {
      if (!this.tourName)
        return false;
      if (!this.tourDate)
        return false;
      return true;
    }
  };
})();
//# sourceMappingURL=tourOrder.js.map
