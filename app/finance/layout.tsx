import Link from 'next/link';

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: 16 }}>
      <nav
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          padding: 12,
          border: '1px solid #eee',
          borderRadius: 12,
          background: 'white',
          marginBottom: 16,
        }}
      >
        <NavLink href="/finance">Home</NavLink>
        <NavLink href="/finance/overview">Overview</NavLink>
        <NavLink href="/finance/bs">B/S 明細</NavLink>
        <NavLink href="/finance/pl">P/L 明細</NavLink>
        <NavLink href="/finance/series">推移グラフ</NavLink>
      </nav>
      {children}
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        padding: '8px 12px',
        border: '1px solid #ddd',
        borderRadius: 8,
        textDecoration: 'none',
        color: '#111',
        background: '#f9fafb',
      }}
    >
      {children}
    </Link>
  );
}
