import { Type } from "class-transformer";
import {
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  NotEquals,
} from "class-validator";

export class CreateCreditCommandDto {
  @IsUUID("4")
  accountId!: string;

  @Type(() => Number)
  @IsInt()
  @NotEquals(0)
  @Min(-100_000_000)
  @Max(100_000_000)
  amountCents!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(240)
  reason!: string;
}
