import Image from "next/image";
import logo from "../../../public/brand/toga-logo.png";
import wordmark from "../../../public/brand/toga-wordmark.png";

type Props = { className?: string; priority?: boolean };

/** Logo completo: TOGA + PLATA.925. Para el login y pantallas amplias. */
export function TogaLogo({ className, priority }: Props) {
  return <Image src={logo} alt="TOGA Plata .925" className={className} priority={priority} />;
}

/** Solo la palabra TOGA. Para el encabezado. */
export function TogaWordmark({ className, priority }: Props) {
  return <Image src={wordmark} alt="TOGA" className={className} priority={priority} />;
}
