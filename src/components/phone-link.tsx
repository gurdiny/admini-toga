import { MessageCircle, Phone } from "lucide-react";

/** "5512345678" → "55 1234 5678" */
export function formatPhone(phone: string): string {
  return phone.length === 10 ? `${phone.slice(0, 2)} ${phone.slice(2, 6)} ${phone.slice(6)}` : phone;
}

/** Teléfono que llama al tocarlo y, si tiene WhatsApp, botón para abrir el chat. */
export function PhoneLink({ phone, whatsApp }: { phone: string; whatsApp: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <a href={`tel:+52${phone}`} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
        <Phone className="size-3.5" aria-hidden />
        {formatPhone(phone)}
      </a>
      {whatsApp && (
        <a
          href={`https://wa.me/52${phone}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-toga-green-strong inline-flex items-center gap-1 font-bold underline-offset-4 hover:underline"
        >
          <MessageCircle className="size-3.5" aria-hidden />
          WhatsApp
        </a>
      )}
    </span>
  );
}
