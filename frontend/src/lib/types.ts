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
  badges?: { badge: Badge; awardedAt: string }[];
}

export interface Badge {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  color?: string | null;
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
  teacherLead?: UserLite | null;
  studentLead?: UserLite | null;
  members?: { role: string; user: UserLite; joinedAt: string }[];
  projects?: ProjectLite[];
  events?: EventItem[];
  news?: News[];
  mentorships?: Mentorship[];
  _count?: { members: number; projects?: number; events?: number; news?: number; mentorships?: number };
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
  technologies?: { id: string; name: string }[];
  members?: { roleInProject?: string | null; user: UserLite }[];
  comments?: CommentItem[];
  approvals?: Approval[];
  likedByMe?: boolean;
  gallery?: { id: string; url: string }[];
  news?: News[];
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
  actor?: (UserLite & { email?: string | null }) | null;
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
  teamsUrl?: string | null;
  youtubeUrl?: string | null;
  capacity?: number | null;
  mentorName?: string | null;
  mentor?: UserLite | null;
  community?: { slug: string; name: string; accentColor?: string | null } | null;
  _count?: { enrollments: number };
  canManage?: boolean;
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
