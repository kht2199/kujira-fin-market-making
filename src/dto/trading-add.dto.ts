import { ArrayMinSize, IsArray, IsNotEmpty } from "class-validator";

export class TradingAddDto {
  @IsNotEmpty()
  account: string;
  @IsNotEmpty()
  contract: string;
  @IsArray()
  @ArrayMinSize(1)
  deltaRates: number[];
  @IsNotEmpty()
  targetRate: number;
  @IsNotEmpty()
  orderAmountMin: number;
}