// /types/finance.ts ver.1
export interface AccountBalance {
  account_code: string;
  account_name: string;
  balance: number;
}

export interface TransactionDetail {
  id: string;
  transaction_date: string;
  account_code: string;
  account_name: string;
  counter_account: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
  balance: number;
}
