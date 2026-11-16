export class TourOrder {
  
  customerName;
  customerEmail;
  
  tourName;
  tourCode;
  tourDate;
  
  processingFees = 0.03; // processing fees
  
  items = []; // array of items
  
  total () {
    // Calc price
    
    var p = 0;
    for (var i = 0; i < this.items.length; i++)
      p += this.items[i].price * this.items[i].quantity;
    
    return p;
  }
  
  totalFees() {
    
    return this.total() * this.processingFees;
  }
  
  totalWithFees() {
    
    return this.total() + this.totalFees(); //* (1 + this.fees); 
  }
  
}