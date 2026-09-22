import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CreditCommandService } from "@lab/credits";
import { CreateCreditCommandDto } from "./create-credit-command.dto";

const idempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;

@ApiTags("credits")
@Controller("v1/credit-commands")
export class CreditsController {
  constructor(private readonly commands: CreditCommandService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "Accept a credit command for reliable asynchronous processing",
  })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiResponse({
    status: 202,
    description: "Command accepted or previously accepted",
  })
  async create(
    @Headers("idempotency-key") operationKey: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
    @Body() body: CreateCreditCommandDto,
  ) {
    if (!operationKey || !idempotencyKeyPattern.test(operationKey)) {
      throw new BadRequestException(
        "Idempotency-Key must contain 8 to 128 letters, numbers, dots, underscores, or hyphens",
      );
    }

    const command = await this.commands.create({
      operationKey,
      accountId: body.accountId,
      amountCents: body.amountCents,
      reason: body.reason,
      traceId: requestId ?? randomUUID(),
    });

    return {
      ...command,
      statusUrl: `/v1/credit-commands/${command.commandId}`,
    };
  }

  @Get(":commandId")
  @ApiOperation({
    summary: "Read the durable status and result of a credit command",
  })
  get(
    @Param("commandId", new ParseUUIDPipe({ version: "4" })) commandId: string,
  ) {
    return this.commands.get(commandId);
  }
}
