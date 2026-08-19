# Security Incident Response Policy

Effective date: 2026-08-03
Policy owner: Masahiko Sato
Security contact: staff@aizu-tv.com
Review cycle: At least once every six months and after every material incident

## Scope

This policy covers TSA, its Amazon Selling Partner API integration, API credentials,
Vercel-hosted application services, Supabase-hosted databases, and any Amazon
information processed by these systems.

## Access And Protection

- Access to TSA and Amazon information is restricted to authorized personnel based
  on job responsibilities.
- Amazon API credentials must be stored only in encrypted managed secret stores or
  environment variables. They must not be committed to source control, embedded in
  application code, or shared through chat or email.
- Amazon information must be encrypted in transit using TLS. Managed hosting and
  database network controls must remain enabled.
- Accounts with access to production systems must use a password of at least 12
  characters including a special character, multi-factor authentication where the
  service supports it, and credential rotation at least annually or immediately
  after suspected compromise.

## Monitoring And Reporting

- Vercel execution logs, scheduled-sync results, application error logs, and
  Supabase access records are reviewed when an alert or abnormal synchronization
  result occurs.
- Any employee who suspects unauthorized access, credential exposure, data loss,
  or misuse must immediately notify the policy owner and security contact.
- The security contact assesses impact, preserves relevant logs, disables or
  rotates affected credentials, limits access, and coordinates remediation.
- A security incident involving Amazon information must be reported to
  security@amazon.com within 24 hours of detection. The report must include the
  known scope, affected data, containment actions, and planned remediation.

## Recovery And Follow-up

- Restore service only after compromised credentials are rotated and the affected
  path is contained.
- Record the timeline, impact, decisions, notifications, and remediation for every
  material incident.
- Complete a post-incident review and update this policy, technical controls, and
  training when needed.

## Scheduled Review

The policy owner reviews this policy every February and August. The review confirms
contacts, access rights, MFA status, credential rotation, third-party processors,
and the Amazon 24-hour reporting procedure.
