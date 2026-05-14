import { ImageResponse } from 'next/og';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #4a98ff 0%, #3182f6 55%, #1b64da 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 14,
          position: 'relative',
          fontFamily: 'system-ui',
        }}
      >
        {/* soft highlight */}
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            right: 6,
            height: 24,
            borderRadius: 10,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.30), rgba(255,255,255,0))',
          }}
        />
        {/* ₩ symbol */}
        <div
          style={{
            color: '#fff',
            fontSize: 42,
            fontWeight: 800,
            letterSpacing: '-0.06em',
            lineHeight: 1,
            display: 'flex',
            position: 'relative',
            textShadow: '0 1px 0 rgba(0,0,0,0.10)',
          }}
        >
          ₩
        </div>
        {/* accent dot */}
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            width: 8,
            height: 8,
            borderRadius: 999,
            background: '#fff',
            opacity: 0.85,
            display: 'flex',
          }}
        />
      </div>
    ),
    { ...size }
  );
}
