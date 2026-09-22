import { Module } from "@nestjs/common";
import { CreditCommandService } from "./credit-command.service";
import { CreditProcessorService } from "./credit-processor.service";

@Module({
  providers: [CreditCommandService, CreditProcessorService],
  exports: [CreditCommandService, CreditProcessorService],
})
export class CreditsModule {}
