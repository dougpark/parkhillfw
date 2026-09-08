import {
    BookOpen, Calendar, Camera, FileText, Folder, Heart, Home, Info,
    Landmark, Leaf, Link as LinkIcon, Mail, MapPin, Megaphone, Phone,
    ShieldCheck, Users, Wrench,
} from 'lucide-vue-next';
import type { Component } from 'vue';

export const MENU_ICONS: Record<string, Component> = {
    folder: Folder,
    file: FileText,
    link: LinkIcon,
    home: Home,
    info: Info,
    calendar: Calendar,
    users: Users,
    'book-open': BookOpen,
    megaphone: Megaphone,
    'shield-check': ShieldCheck,
    'map-pin': MapPin,
    phone: Phone,
    mail: Mail,
    camera: Camera,
    heart: Heart,
    leaf: Leaf,
    landmark: Landmark,
    wrench: Wrench,
};

export const MENU_ICON_NAMES = Object.keys(MENU_ICONS);

export function menuIcon(name: string | null | undefined, kind: string): Component {
    if (name && MENU_ICONS[name]) return MENU_ICONS[name]!;
    if (kind === 'page') return FileText;
    if (kind === 'link') return LinkIcon;
    return Folder;
}
