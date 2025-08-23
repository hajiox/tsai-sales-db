// /app/__health/page.tsx
"use client";

import React from "react";

export default function HealthPage() {
  return (
    <div style={{ padding: 24 }}>
      <h1>OK: health page</h1>
      <p>このページが表示できれば RootLayout は生きています。</p>
    </div>
  );
}
