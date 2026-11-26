export const STRINGS = {
  es: {
    title: "Interpreta tus mensajes exportados",
    description:
      "Cuando exportas un chat de WhatsApp, leerlo se vuelve caótico. WA Reader le da formato y lo muestra como en la app.",
    chooseFile: "Elige un archivo",
    dropHint: "o arrástralo aquí (.txt de WhatsApp Android, iPhone o Web)",
    preview: "Vista previa",
    loaded: "{file}: {n} mensajes",
    participants: "Participantes",
    povHint: "Toca a un participante para ver la conversación desde su lado.",
    invalidType: "Selecciona un archivo .txt exportado de WhatsApp.",
    readError: "No se pudo leer el archivo.",
    noMessages: "No se encontraron mensajes. ¿Es un chat exportado de WhatsApp?",
    loading: "Leyendo {file}…",
    edited: "editado",
    newFile: "Cargar otro archivo",
    themeGroup: "Tema",
    dark: "Modo oscuro",
    light: "Modo claro",
    langGroup: "Idioma",
    developer: "Desarrollador",
    disclaimer: "Proyecto experimental. Tu chat se procesa en tu navegador y nunca se sube a ningún servidor.",
    sourceCode: "Código fuente",
    credits: "Desarrollado por DavidQuint",
    sampleUser: "Usuario",
    sampleBody: "Así se verá el cuerpo del texto",
    sampleReply: "Y así tus propios mensajes 👋",
    sampleNotice: "Los avisos del grupo aparecen centrados",
  },
  en: {
    title: "Read your exported chats",
    description:
      "Exported WhatsApp chats are hard to read. WA Reader formats them and shows them just like the app does.",
    chooseFile: "Choose a file",
    dropHint: "or drop it here (.txt from WhatsApp Android, iPhone or Web)",
    preview: "Preview",
    loaded: "{file}: {n} messages",
    participants: "Participants",
    povHint: "Tap a participant to see the conversation from their side.",
    invalidType: "Please choose a .txt file exported from WhatsApp.",
    readError: "The file could not be read.",
    noMessages: "No messages found. Is this an exported WhatsApp chat?",
    loading: "Reading {file}…",
    edited: "edited",
    newFile: "Load another file",
    themeGroup: "Theme",
    dark: "Dark mode",
    light: "Light mode",
    langGroup: "Language",
    developer: "Developer",
    disclaimer: "Experimental project. Your chat is processed in your browser and is never uploaded anywhere.",
    sourceCode: "Source code",
    credits: "Made by DavidQuint",
    sampleUser: "User",
    sampleBody: "This is how the message body will look",
    sampleReply: "And this is how your own messages look 👋",
    sampleNotice: "Group notices are shown centered",
  },
};

export const LANGS = Object.keys(STRINGS);

export function t(lang, key, vars = {}) {
  const template = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? "");
}
