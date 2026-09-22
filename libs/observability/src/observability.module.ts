import { Global, Module } from "@nestjs/common";
import { HttpMetricsInterceptor } from "./http-metrics.interceptor";
import { MetricsService } from "./metrics.service";

@Global()
@Module({
  providers: [MetricsService, HttpMetricsInterceptor],
  exports: [MetricsService, HttpMetricsInterceptor],
})
export class ObservabilityModule {}
