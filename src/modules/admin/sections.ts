import { History, SlidersHorizontal, Tags, Trash2, UserCog, Users, type LucideIcon } from "lucide-react";

/** Secciones de /admin. Agregar una aquí la pone en la navegación y en el inicio del panel. */
export const ADMIN_SECTIONS: { href: string; label: string; description: string; icon: LucideIcon }[] = [
  { href: "/admin/catalogos", label: "Catálogos", description: "Categorías de pago y de proveedor; activar y desactivar proveedores.", icon: Tags },
  { href: "/admin/clientes", label: "Clientes", description: "Historial de pedidos y fusionar clientes duplicados.", icon: Users },
  { href: "/admin/usuarios", label: "Usuarios", description: "Altas, roles, contraseñas y desactivar.", icon: UserCog },
  { href: "/admin/auditoria", label: "Auditoría", description: "Quién cambió qué y cuándo.", icon: History },
  { href: "/admin/configuracion", label: "Configuración", description: "Nombre del negocio, valores por defecto, mensaje de WhatsApp y módulos.", icon: SlidersHorizontal },
  { href: "/admin/papelera", label: "Papelera", description: "Lo borrado; restaurar si fue un error.", icon: Trash2 },
];
