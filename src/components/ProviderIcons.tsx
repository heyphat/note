import type { SVGProps } from 'react';
import type { ProviderId } from '@/lib/ai';

interface ProviderIconProps extends SVGProps<SVGSVGElement> {
  providerId: ProviderId;
}

export default function ProviderIcon({ providerId, ...props }: ProviderIconProps) {
  if (providerId === 'google') return <GoogleIcon {...props} />;
  if (providerId === 'openai') return <OpenAIIcon {...props} />;
  if (providerId === 'bedrock') return <BedrockIcon {...props} />;
  if (providerId === 'vertex') return <VertexIcon {...props} />;
  return <AnthropicIcon {...props} />;
}

function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg role="img" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133c-1.147 1.147-2.933 2.4-6.053 2.4c-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0C5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36c2.16-2.16 2.84-5.213 2.84-7.667c0-.76-.053-1.467-.173-2.053z" />
    </svg>
  );
}

function OpenAIIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg role="img" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M22.282 9.821a6 6 0 0 0-.516-4.91a6.05 6.05 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a6 6 0 0 0-3.998 2.9a6.05 6.05 0 0 0 .743 7.097a5.98 5.98 0 0 0 .51 4.911a6.05 6.05 0 0 0 6.515 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.772-4.206a6 6 0 0 0 3.997-2.9a6.06 6.06 0 0 0-.747-7.073M13.26 22.43a4.48 4.48 0 0 1-2.876-1.04l.141-.081l4.779-2.758a.8.8 0 0 0 .392-.681v-6.737l2.02 1.168a.07.07 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494M3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085l4.783 2.759a.77.77 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646M2.34 7.896a4.5 4.5 0 0 1 2.366-1.973V11.6a.77.77 0 0 0 .388.677l5.815 3.354l-2.02 1.168a.08.08 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.08.08 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667m2.01-3.023l-.141-.085l-4.774-2.782a.78.78 0 0 0-.785 0L9.409 9.23V6.897a.07.07 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.8.8 0 0 0-.393.681zm1.097-2.365l2.602-1.5l2.607 1.5v2.999l-2.597 1.5l-2.607-1.5Z" />
    </svg>
  );
}

function AnthropicIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg role="img" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M17.304 3.541h-3.672l6.696 16.918H24Zm-10.608 0L0 20.459h3.744l1.37-3.553h7.005l1.369 3.553h3.744L10.536 3.541Zm-.371 10.223L8.616 7.82l2.291 5.945Z" />
    </svg>
  );
}

function BedrockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg role="img" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M2.4 6.6 12 1.2l9.6 5.4v10.8L12 22.8 2.4 17.4Zm9.6-3.84L4.32 7.08v9.84L12 21.24l7.68-4.32V7.08Zm-5.76 6 5.76-3.24 5.76 3.24v6.48L12 18.24l-5.76-3.24Zm1.92 1.08v4.32L12 16.08l3.84-2.16V9.84L12 7.68Z" />
    </svg>
  );
}

function VertexIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg role="img" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M12 2 2.4 7.2v9.6L12 22l9.6-5.2V7.2Zm0 2.16 7.68 4.16v7.36L12 19.84 4.32 15.68V8.32Zm-3.84 4.8h7.68v6.08h-2.4V11.04h-2.88v3.6h-2.4Z" />
    </svg>
  );
}
