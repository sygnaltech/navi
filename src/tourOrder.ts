interface Item {
    product: string;
    price: number;
    quantity: number;
  }
  
  export class TourOrder {
    customerName: string;
    customerEmail: string;
    
    tourName: string;
    tourCode: string;
    tourDate: string;
    
    processingFees: number = 0.03; // processing fees
    
    items: Item[] = []; // array of items
    
    total(): number {
      // Calc price
      let p = 0;
      for (let i = 0; i < this.items.length; i++) {
        p += this.items[i].price * this.items[i].quantity;
      }
      return p;
    }
    
    totalFees(): number {
      return this.total() * this.processingFees;
    }
    
    totalWithFees(): number {
      return this.total() + this.totalFees();
    }

    get valid(): boolean {
      if (!this.tourName)
        return false;
      if (!this.tourDate)
        return false;
      return true;
    }
  }
  