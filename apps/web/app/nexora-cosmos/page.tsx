import type { Metadata } from 'next'
import { NexoraCosmos } from '../../components/nexora-cosmos'

export const metadata: Metadata = {
  title: 'Nexora Cosmos · Ghost Nexora Bot',
  description: 'Explora una visualización interactiva y dinámica del Sistema Solar dentro del ecosistema Nexora.',
}

export default function NexoraCosmosPage() { return <NexoraCosmos /> }
