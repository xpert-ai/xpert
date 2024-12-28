import { SerializedConstructor } from '@langchain/core/load/serializable';
import { ChatLarkMessage } from '../chat/message';
import { LarkService } from '../lark.service';
import { ChatLarkContext } from '../types';

describe('ChatLarkMessage', () => {
    it('should correctly serialize and deserialize using toJSON and fromJSON', () => {
        const chatContext: ChatLarkContext = {
            larkService: null
        } as ChatLarkContext
        const options = { userId: 'user123', xpertId: 'xpert456', text: 'Test message' };
        const originalMessage = new ChatLarkMessage(chatContext, options);

        // Set some properties to test serialization
        originalMessage.status = 'waiting';

        // Serialize the message
        const serialized = originalMessage.toJSON() as SerializedConstructor

        console.log(JSON.stringify(serialized, null, 2))

        const nm = new ChatLarkMessage(chatContext, serialized.kwargs)

        console.log(JSON.stringify(nm.toJSON(), null, 2))

        // Deserialize the message
        // const deserializedMessage = ChatLarkMessage.fromJSON(serialized);

        // Assertions
        // expect(deserializedMessage).toBeInstanceOf(ChatLarkMessage);
        // expect(deserializedMessage.status).toEqual(originalMessage.status);
        // expect(deserializedMessage.options).toEqual(originalMessage.options);
        // expect(deserializedMessage.lc_namespace).toEqual(originalMessage.lc_namespace);
    });
});
