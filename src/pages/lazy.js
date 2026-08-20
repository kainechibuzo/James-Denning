/**
 * Lazy-loaded page components.
 *
 * Each domain file becomes a separate webpack/Rollup chunk loaded on demand.
 * Use these in the main page switch instead of the static named imports —
 * the initial bundle only ships the shell; page code arrives when first visited.
 *
 * Pattern:  React.lazy(() => import('./file.jsx').then(m => ({ default: m.ExportName })))
 */
import React from "react";

const lz = (importFn, key) =>
  React.lazy(() => importFn().then(m => ({ default: m[key] })));

// ── Login ──────────────────────────────────────────────────────────────────────
export const LoginPage           = lz(() => import('./login.jsx'),       'LoginPage');
export const SchoolManagerModal  = lz(() => import('./login.jsx'),       'SchoolManagerModal');

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const DashboardPage       = lz(() => import('./dashboard.jsx'),   'DashboardPage');
export const StudentDashboard    = lz(() => import('./dashboard.jsx'),   'StudentDashboard');
export const TeacherDashboard    = lz(() => import('./dashboard.jsx'),   'TeacherDashboard');
export const MyProfilePage       = lz(() => import('./dashboard.jsx'),   'MyProfilePage');
export const SectionsPage        = lz(() => import('./dashboard.jsx'),   'SectionsPage');
export const ManagerDashboard    = lz(() => import('./dashboard.jsx'),   'ManagerDashboard');
export const BursarDashboard     = lz(() => import('./dashboard.jsx'),   'BursarDashboard');

// ── Members ───────────────────────────────────────────────────────────────────
export const MembersPage         = lz(() => import('./members.jsx'),     'MembersPage');

// ── Members ──────────────────────────────────────────────────────────────────
export const StudentsPage            = lz(() => import('./students.jsx'), 'StudentsPage');
export const TeacherAddStudentsPage  = lz(() => import('./students.jsx'), 'TeacherAddStudentsPage');
export const StudentApprovalsPage    = lz(() => import('./students.jsx'), 'StudentApprovalsPage');

// ── Staff ──────────────────────────────────────────────────────────────────
export const TeachersPage        = lz(() => import('./teachers.jsx'),    'TeachersPage');

// ── Groups ───────────────────────────────────────────────────────────────────
export const ClassesPage         = lz(() => import('./classes.jsx'),     'ClassesPage');
export const AssignmentsPage     = lz(() => import('./classes.jsx'),     'AssignmentsPage');

// ── Curriculum ────────────────────────────────────────────────────────────────
export const SubjectsPage        = lz(() => import('./curriculum.jsx'),  'SubjectsPage');
export const SessionsPage        = lz(() => import('./curriculum.jsx'),  'SessionsPage');

// ── Results ───────────────────────────────────────────────────────────────────
export const ResultsAdminPage    = lz(() => import('./results.jsx'),     'ResultsAdminPage');
export const ResultsTeachPage    = lz(() => import('./results.jsx'),     'ResultsTeachPage');
export const MyResultsPage       = lz(() => import('./results.jsx'),     'MyResultsPage');
export const MyClassesPage       = lz(() => import('./results.jsx'),     'MyClassesPage');

// ── Grading ───────────────────────────────────────────────────────────────────
export const GradingPage         = lz(() => import('./grading.jsx'),     'GradingPage');
export const CaeStructurePanel   = lz(() => import('./grading.jsx'),     'CaeStructurePanel');

// ── Permissions ───────────────────────────────────────────────────────────────
export const PermissionsPage     = lz(() => import('./permissions.jsx'), 'PermissionsPage');
export const SaveTemplateForm    = lz(() => import('./permissions.jsx'), 'SaveTemplateForm');
export const ApplyTemplateBtn    = lz(() => import('./permissions.jsx'), 'ApplyTemplateBtn');

// ── Billing ──────────────────────────────────────────────────────────────────────
export const FeesPage            = lz(() => import('./fees.jsx'),        'FeesPage');
export const PaymentsPage        = lz(() => import('./fees.jsx'),        'PaymentsPage');
export const MyPaymentsPage      = lz(() => import('./fees.jsx'),        'MyPaymentsPage');
export const FeeItemsPage        = lz(() => import('./fees.jsx'),        'FeeItemsPage');
export const FeeTemplatesPage    = lz(() => import('./fees.jsx'),        'FeeTemplatesPage');
export const FeeGeneratePage     = lz(() => import('./fees.jsx'),        'FeeGeneratePage');
export const FeeTrackerPage      = lz(() => import('./fees.jsx'),        'FeeTrackerPage');
export const FeeStatsPage        = lz(() => import('./fees.jsx'),        'FeeStatsPage');
export const MyBillPage          = lz(() => import('./fees.jsx'),        'MyBillPage');

// ── Transcript ────────────────────────────────────────────────────────────────
export const TranscriptPage      = lz(() => import('./transcript.jsx'),  'TranscriptPage');

// ── Settings ──────────────────────────────────────────────────────────────────
export const SettingsPage        = lz(() => import('./settings.jsx'),    'SettingsPage');

// ── Reports ──────────────────────────────────────────────────────────────
export const ReportCardsPage         = lz(() => import('./reportcards.jsx'), 'ReportCardsPage');
export const ResultApprovalsPage     = lz(() => import('./reportcards.jsx'), 'ResultApprovalsPage');
export const ReportCardSettingsPage  = lz(() => import('./reportcards.jsx'), 'ReportCardSettingsPage');
export const ReportTemplatesPage     = lz(() => import('./reportcards.jsx'), 'ReportTemplatesPage');

// ── Comms (already-extracted domain) ─────────────────────────────────────────
export const AnnouncePage        = lz(() => import('./comms.jsx'),       'AnnouncePage');
export const MailComposePage     = lz(() => import('./comms.jsx'),       'MailComposePage');
export const MailLogsPage        = lz(() => import('./comms.jsx'),       'MailLogsPage');

// ── Schedule (already-extracted domain) ───────────────────────────────────────
export const AttendancePage      = lz(() => import('./schedule.jsx'),    'AttendancePage');
export const AcademicCalendarPage= lz(() => import('./schedule.jsx'),    'AcademicCalendarPage');
export const TimetablePage       = lz(() => import('./schedule.jsx'),    'TimetablePage');

// ── Analytics ─────────────────────────────────────────────────────────────────
export const AcademicSummaryPage = lz(() => import('./analytics.jsx'), 'AcademicSummaryPage');

// ── Tools (already-extracted domain) ─────────────────────────────────────────
export const RecycleBinPage      = lz(() => import('./tools.jsx'),       'RecycleBinPage');
export const DataExportPage      = lz(() => import('./tools.jsx'),       'DataExportPage');
export const ActivityPage        = lz(() => import('./tools.jsx'),       'ActivityPage');
export const BroadsheetPage      = lz(() => import('./tools.jsx'),       'BroadsheetPage');
export const AuditLogPage        = lz(() => import('./tools.jsx'),       'AuditLogPage');
export const BulkPromotionPage   = lz(() => import('./tools.jsx'),       'BulkPromotionPage');

// ── Access (already-extracted domain) ────────────────────────────────────────
export const TeacherAccessRequestPage  = lz(() => import('./access.jsx'), 'TeacherAccessRequestPage');
export const AccessRequestsAdminPage   = lz(() => import('./access.jsx'), 'AccessRequestsAdminPage');
