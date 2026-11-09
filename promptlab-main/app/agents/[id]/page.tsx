import { AgentEditor } from '@/components/AgentEditor';

export const metadata = { title: 'Agent editor · KV Prompt Lab' };

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgentEditor id={id} />;
}
