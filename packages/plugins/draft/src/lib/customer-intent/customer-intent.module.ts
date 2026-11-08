import { Module } from '@nestjs/common'
import { CustomerIntentFeedback } from './feedback'
import { CustomerIntentNode } from './node'
import { CustomerIntentProvider } from './provider'

@Module({
  providers: [CustomerIntentFeedback, CustomerIntentNode, CustomerIntentProvider],
  exports: [CustomerIntentNode, CustomerIntentProvider]
})
export class CustomerIntentModule {}
