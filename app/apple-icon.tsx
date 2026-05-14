import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
          position: 'relative',
          fontFamily: 'system-ui',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 18,
            left: 18,
            right: 18,
            height: 72,
            borderRadius: 28,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0))',
          }}
        />
        <div
          style={{
            color: '#fff',
            fontSize: 120,
            fontWeight: 800,
            letterSpacing: '-0.06em',
            lineHeight: 1,
            display: 'flex',
            textShadow: '0 2px 0 rgba(0,0,0,0.10)',
          }}
        >
          ₩
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            right: 24,
            width: 22,
            height: 22,
            borderRadius: 999,
            background: '#fff',
            opacity: 0.9,
            display: 'flex',
          }}
        />
      </div>
    ),
    { ...size }
  );
}
