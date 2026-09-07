import { getMetadataArgsStorage } from 'typeorm'
import { ModelUsageDeliveryReceipt } from './model-usage-delivery-receipt.entity'

describe('ModelUsageDeliveryReceipt', () => {
    it('uses a unique request scope and explicit delivery columns', () => {
        const metadata = getMetadataArgsStorage()
        const unique = metadata.indices.find(
            (index) =>
                index.target === ModelUsageDeliveryReceipt && index.name === 'UQ_model_usage_delivery_receipt_request'
        )
        const column = (propertyName: string) =>
            metadata.columns.find(
                (item) => item.target === ModelUsageDeliveryReceipt && item.propertyName === propertyName
            )?.options

        expect(unique?.unique).toBe(true)
        expect(column('payloadFingerprint')).toMatchObject({ type: 'varchar', length: 64 })
        expect(column('userRollupDeliveredAt')).toMatchObject({ type: 'timestamptz', nullable: true })
        expect(column('organizationRollupDeliveredAt')).toMatchObject({ type: 'timestamptz', nullable: true })
        expect(column('userTokenLimitExceeded')).toMatchObject({ type: 'boolean', default: false })
        expect(column('organizationTokenLimitExceeded')).toMatchObject({ type: 'boolean', default: false })
    })
})
