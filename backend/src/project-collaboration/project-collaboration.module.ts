import { Global, Module } from '@nestjs/common';
import { ProjectAccessService } from './project-access.service';
import { ProjectAuditService } from './project-audit.service';
import { ProjectAuditDeliveryWorker } from './project-audit-delivery.worker';

@Global()
@Module({
  providers: [ProjectAccessService, ProjectAuditService, ProjectAuditDeliveryWorker],
  exports: [ProjectAccessService, ProjectAuditService],
})
export class ProjectCollaborationModule {}
