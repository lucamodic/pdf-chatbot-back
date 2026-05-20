import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(private activityLog: ActivityLogService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof Error ? exception.message : String(exception);

    const stack = exception instanceof Error ? exception.stack : undefined;

    this.logger.error(`[${status}] ${message}`);

    // Only persist 500s — 4xx are expected (bad input, unauthorized, etc.)
    if (status >= 500) {
      const ctx = host.getType();
      const meta: Record<string, any> = { statusCode: status, hostType: ctx };

      if (ctx === 'http') {
        const req = host.switchToHttp().getRequest();
        meta.method = req.method;
        meta.url = req.url;
        meta.body = req.body;
      }

      this.activityLog.error('GlobalFilter', message, exception instanceof Error ? exception : undefined, meta);
    }

    // Send response for HTTP context
    if (host.getType() === 'http') {
      const res = host.switchToHttp().getResponse();
      res.status(status).json({
        statusCode: status,
        message: status >= 500 ? 'Internal server error' : message,
      });
    }
  }
}
