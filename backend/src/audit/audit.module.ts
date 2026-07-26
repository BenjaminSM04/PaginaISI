import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

export {
  AuditService,
  auditSnapshot,
  resolveAuditActor,
} from './audit.service';
export type {
  AuditActorSnapshot,
  AuditDatabase,
  ListAuditInput,
  RecordSystemAuditInput,
} from './audit.service';
