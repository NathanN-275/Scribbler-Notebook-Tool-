import { NoteEditor } from "../../../components/editor";

export default async function NotePage({ params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params;
  return <NoteEditor key={noteId} noteId={noteId} />;
}
