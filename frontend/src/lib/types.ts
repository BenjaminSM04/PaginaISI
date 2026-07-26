export interface ProfileLite {
  fullName: string;
  avatarUrl?: string | null;
  semester?: number | null;
  totalPoints?: number;
}

export interface UserLite {
  id?: string;
  username: string;
  profile?: ProfileLite | null;
  roles?: string[];
}

export interface Me {
  id: string;
  email: string;
  emailVerifiedAt?: string | null;
  username: string;
  roles: string[];
  profile?: {
    fullName: string;
    avatarUrl?: string | null;
    bio?: string | null;
    career?: string;
    semester?: number | null;
    githubUrl?: string | null;
    linkedinUrl?: string | null;
    websiteUrl?: string | null;
    devPoints: number;
    researchPoints: number;
    communityPoints: number;
    totalPoints: number;
  } | null;
  badges?: UserBadgeAward[];
}

export type BadgeRuleType =
  | 'ANSWERS_COUNT'
  | 'ACCEPTED_ANSWERS_COUNT'
  | 'TOTAL_POINTS'
  | 'APPROVED_PROJECTS_COUNT'
  | 'ATTENDED_EVENTS_COUNT'
  | 'COMPLETED_MENTORSHIPS_COUNT'
  | 'COMMUNITY_MEMBERSHIPS_COUNT';

export interface Badge {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  color?: string | null;
  ruleType?: BadgeRuleType | null;
  targetValue?: number | null;
  isActive?: boolean;
  isRetroactive?: boolean;
  createdAt?: string;
}

export interface UserBadgeAward {
  id?: string;
  badge: Badge;
  awardedAt: string;
  reasonSnapshot?: string | null;
  progressValue?: number | null;
}

export interface News {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content?: string;
  category: string;
  coverUrl?: string | null;
  tags: string[];
  likesCount: number;
  likedByMe?: boolean;
  status?: string;
  publishedAt?: string | null;
  author?: UserLite;
  community?: { slug: string; name: string; accentColor?: string | null } | null;
  event?: { slug: string; title: string; startsAt: string } | null;
  project?: { id: string; slug: string; title: string; version?: number } | null;
}

export interface Community {
  id: string;
  slug: string;
  name: string;
  description: string;
  isActive?: boolean;
  teacherLeadId?: string | null;
  studentLeadId?: string | null;
  longDescription?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  accentColor?: string | null;
  whatsappUrl?: string | null;
  teamsUrl?: string | null;
  discordUrl?: string | null;
  teacherIds?: string[];
  links?: CommunityLink[];
  teacherLead?: UserLite | null;
  studentLead?: UserLite | null;
  members?: CommunityMember[];
  projects?: ProjectLite[];
  events?: EventItem[];
  news?: News[];
  mentorships?: Mentorship[];
  _count?: { members: number; projects?: number; events?: number; news?: number; mentorships?: number };
}

export interface CommunityLink {
  id?: string;
  platform: string;
  label?: string | null;
  url: string;
  order?: number;
  sortOrder?: number;
  isActive: boolean;
}

export type CommunityMembershipRole = 'MEMBER' | 'STUDENT_LEAD' | 'TEACHER_LEAD';

export interface CommunityMember {
  id?: string;
  userId?: string;
  role: CommunityMembershipRole;
  joinedAt: string;
  user: Omit<UserLite, 'roles'> & {
    roles?: string[] | { role: { name: string } }[];
  };
}

export interface ProjectLite {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverUrl?: string | null;
  stage: string;
  likesCount: number;
  tags: string[];
}

export interface Project extends ProjectLite {
  version?: number;
  description?: string;
  videoUrl?: string | null;
  repoUrl?: string | null;
  demoUrl?: string | null;
  subject?: string | null;
  semester?: number | null;
  phase?: string | null;
  status: string;
  publicStatus?: string;
  isFeatured: boolean;
  isIncubator: boolean;
  recruiting: boolean;
  viewsCount: number;
  startedAt?: string | null;
  publishedAt?: string | null;
  createdAt?: string;
  owner?: UserLite;
  reviewer?: UserLite | null;
  community?: { slug: string; name: string; accentColor?: string | null } | null;
  technologies?: { id: string; name: string; normalizedName?: string }[];
  members?: { roleInProject?: string | null; user: UserLite }[];
  clients?: IncubatorClient[];
  comments?: CommentItem[];
  approvals?: Approval[];
  likedByMe?: boolean;
  gallery?: { id: string; url: string }[];
  news?: News[];
  pendingVersion?: ProjectVersionSummary | null;
}

export interface ProjectVersionSummary {
  id: string;
  number: number;
  status: 'PENDING' | 'OBSERVED' | 'REJECTED' | 'PUBLISHED' | 'SUPERSEDED';
  submittedAt: string;
  decidedAt?: string | null;
  publishedAt?: string | null;
  reviewComment?: string | null;
  requester?: UserLite;
  reviewer?: UserLite | null;
  snapshot?: Record<string, unknown>;
}

export interface ProjectManagementAccess {
  isAdmin: boolean;
  isOwner: boolean;
  isMember: boolean;
  canManageMembers: boolean;
  role?: 'ADMIN' | 'Líder' | 'Colaborador';
}

export interface ManageableProject extends ProjectLite {
  status: string;
  version: number;
  updatedAt?: string;
  owner?: UserLite;
  community?: { slug: string; name: string } | null;
  access: ProjectManagementAccess;
}

export interface ProjectMilestone {
  id: string;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt?: string | null;
  allDay: boolean;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  location?: string | null;
  url?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectAuditEntry {
  id: string;
  action: string;
  entityType?: string | null;
  section?: string | null;
  summary?: string | null;
  projectId?: string;
  project?: { id: string; title: string; slug?: string | null } | null;
  actor?: (UserLite & { email?: string | null; roles?: string[] }) | null;
  actorId?: string | null;
  actorIdSnapshot?: string | null;
  actorUserId?: string | null;
  actorRolesSnapshot?: string[];
  actorDeleted?: boolean;
  source?: 'PROJECT' | 'SYSTEM';
  actorEmail?: string | null;
  actorEmailSnapshot?: string | null;
  actorUsernameSnapshot?: string | null;
  actorNameSnapshot?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: {
    request?: { ip?: string | null; userAgent?: string | null } | null;
    security?: { riskSignals?: string[] } | null;
  } | null;
  createdAt: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  canRollback?: boolean;
  rolledBackAt?: string | null;
  rollbackEntries?: { id: string; createdAt: string }[];
  delivery?: {
    status: 'PENDING' | 'PROCESSING' | 'SENT' | 'SKIPPED' | 'FAILED';
    attempts?: number;
    sentAt?: string | null;
    lastError?: string | null;
  } | null;
}

export interface ProjectManagementDetail extends Project {
  version: number;
  access: ProjectManagementAccess;
  milestones: ProjectMilestone[];
  gallery: MediaAssetLite[];
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  abstract: string;
  content?: string | null;
  area: string;
  impact?: string | null;
  pdfUrl?: string | null;
  externalUrl?: string | null;
  doi?: string | null;
  coverUrl?: string | null;
  tags: string[];
  likesCount: number;
  status: string;
  publishedAt?: string | null;
  owner?: UserLite;
  reviewer?: UserLite | null;
  authors?: { user?: UserLite | null; externalName?: string | null }[];
  comments?: CommentItem[];
  likedByMe?: boolean;
}

export interface EventItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  coverUrl?: string | null;
  location?: string | null;
  isOnline: boolean;
  meetingUrl?: string | null;
  rulesUrl?: string | null;
  startsAt: string;
  endsAt?: string | null;
  capacity?: number | null;
  isFeatured: boolean;
  isPast?: boolean;
  organizer?: UserLite;
  community?: { slug: string; name: string; accentColor?: string | null } | null;
  _count?: { registrations: number };
  registered?: boolean;
  news?: News[];
  gallery?: { id: string; url: string; mime?: string | null; sizeBytes?: number | null; width?: number | null; height?: number | null }[];
}

export interface Mentorship {
  id: string;
  slug: string;
  title: string;
  description: string;
  area: string;
  difficulty: string;
  syllabus: string[];
  startsAt?: string | null;
  endsAt?: string | null;
  coverUrl?: string | null;
  modality?: 'IN_PERSON' | 'ONLINE' | 'HYBRID';
  location?: string | null;
  meetingUrl?: string | null;
  teamsUrl?: string | null;
  youtubeUrl?: string | null;
  capacity?: number | null;
  mentorName?: string | null;
  mentor?: UserLite | null;
  mentors?: { isLead: boolean; user: UserLite }[];
  enrollments?: { user: UserLite; createdAt: string }[];
  participants?: UserLite[];
  gallery?: MediaAssetLite[];
  community?: { slug: string; name: string; accentColor?: string | null } | null;
  _count?: { enrollments: number };
  canManage?: boolean;
  enrolled?: boolean;
  status?: 'UPCOMING' | 'IN_PROGRESS' | 'COMPLETED' | 'INACTIVE';
  isActive?: boolean;
}

export interface Question {
  id: string;
  title: string;
  body?: string;
  tags: string[];
  subject?: string | null;
  semester?: number | null;
  viewsCount: number;
  votesScore: number;
  answersCount: number;
  acceptedAnswerId?: string | null;
  createdAt: string;
  author?: UserLite;
  images?: MediaAssetLite[];
  answers?: Answer[];
  myVotes?: Record<string, number>;
}

export interface Answer {
  id: string;
  body: string;
  votesScore: number;
  isAccepted: boolean;
  createdAt: string;
  author?: UserLite;
  images?: MediaAssetLite[];
}

export interface MediaAssetLite {
  id: string;
  url: string;
  mime?: string | null;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface IncubatorClient {
  id: string;
  name: string;
  logoUrl?: string | null;
  normalizedName?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    projects?: number;
  };
  projectCount?: number;
}

export interface CommentItem {
  id: string;
  body: string;
  createdAt: string;
  author?: UserLite;
}

export interface Approval {
  id: string;
  targetType: string;
  targetId: string;
  comment?: string | null;
  decision?: string | null;
  createdAt: string;
  decidedAt?: string | null;
}

export interface RankingRow {
  position: number;
  userId: string;
  username: string;
  fullName?: string;
  avatarUrl?: string | null;
  semester?: number | null;
  points: number;
  totalPoints?: number;
  devPoints?: number;
  researchPoints?: number;
  communityPoints?: number;
  badgesCount: number;
}

export interface Paged<T> {
  total: number;
  items: T[];
  page?: number;
  limit?: number;
  pages?: number;
  hasMore?: boolean;
}

export interface PointRule {
  id: string;
  reason: string;
  category: 'DEV' | 'RESEARCH' | 'COMMUNITY';
  points: number;
  dailyLimit?: number | null;
  isActive: boolean;
  label: string;
}

export interface IdeaProposal {
  id: string;
  title: string;
  description: string;
  problem: string;
  proposedSolution: string;
  technologies: string[];
  isRealClient: boolean;
  clientName?: string | null;
  clientContactName?: string | null;
  clientContact?: string | null;
  clientNeed?: string | null;
  clientAuthorizationUrl?: string | null;
  attachmentUrl?: string | null;
  status: string;
  reviewComment?: string | null;
  owner?: UserLite;
  members?: { user: UserLite }[];
  reviewer?: UserLite | null;
  media?: MediaAssetLite[];
  createdAt: string;
  decidedAt?: string | null;
}

export interface InstitutionalApplication {
  id: string;
  name: string;
  description: string;
  icon: string;
  url: string;
  category: string;
  sortOrder: number;
  visibleRoles: string[];
  openInNewTab: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type NotificationType =
  | 'CONTENT_REVIEW'
  | 'FORUM_ANSWER'
  | 'FORUM_ACCEPTED'
  | 'EVENT_REGISTRATION'
  | 'MENTORSHIP_ENROLLMENT'
  | 'SYSTEM';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationPreferences {
  contentReview: boolean;
  forumActivity: boolean;
  eventRegistrations: boolean;
  mentorships: boolean;
  updatedAt: string;
}

export interface NotificationsPage {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
  pages: number;
}
