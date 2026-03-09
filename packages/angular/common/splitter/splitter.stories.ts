import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { Meta, moduleMetadata } from '@storybook/angular'
import { SplitterComponent, SplitterType } from './splitter.component'
import { SplitterModule } from './splitter.module'

export default {
  title: 'Common/Splitter',
  component: SplitterComponent,
  decorators: [
    moduleMetadata({
      imports: [BrowserAnimationsModule, SplitterModule],
    }),
  ],
} as Meta<SplitterComponent>

// const Template: Story<SplitterComponent> = (args: SplitterComponent) => ({
//   template: `<ngm-splitter [type]="type" style='height: 100vh;' [style.width]='"100%"'>
//   <ngm-splitter-pane>
//       <p>
//           Lorem ipsum dolor sit amet, consectetur adipiscing elit. Mauris in lacus eget turpis congue fermentum. Aliquam sollicitudin massa vel ullamcorper bibendum. Donec sit amet augue in justo fermentum facilisis vel quis quam. Vivamus eget iaculis nisi, vitae dignissim leo. Donec eget consectetur lacus. In viverra vehicula libero, quis dictum odio varius in. Phasellus aliquam elit et lectus ornare placerat. Aliquam vitae sapien facilisis, auctor enim quis, consectetur dui. Cras elementum velit eros, ut efficitur ante pellentesque in. Proin vulputate lacus dui, vitae imperdiet dui pharetra ac. Nunc sagittis, sapien et posuere varius, mauris justo tincidunt odio, in interdum lorem libero sed enim. Nulla placerat scelerisque felis vitae accumsan.
//       </p>
//   </ngm-splitter-pane>
//   <ngm-splitter-pane>
//       <p>
//           Duis auctor, diam id vehicula consequat, lacus tellus molestie magna, sed varius nisi quam eget nisl. Donec dignissim mi et elementum laoreet. Nam dignissim quis justo eu fermentum. Proin vestibulum, neque quis elementum tincidunt, nibh mi gravida purus, eget volutpat ipsum magna in orci. Donec id mauris vitae lectus molestie blandit. Praesent non quam interdum, efficitur lacus nec, gravida mauris. Ut ac ante maximus, ultrices turpis a, aliquam magna. Praesent blandit ante ut nulla malesuada lobortis. Praesent a lobortis justo. Morbi congue, dui sed ornare faucibus, turpis felis vulputate arcu, lobortis posuere sem leo eget risus. Duis risus augue, dignissim ac tincidunt a, ullamcorper rutrum nisl. Ut ut ipsum vel purus viverra dapibus.
//       </p>
//   </ngm-splitter-pane>
// </ngm-splitter>`,
//   props: {
//     ...args,
//   }
// })

// export const Horizontal = Template.bind({})
// Horizontal.args = {
//   type: SplitterType.Horizontal
// }

// export const Vertical = Template.bind({})
// Vertical.args = {
//   type: SplitterType.Vertical
// }

// const MultiplePanesTemplate: Story<SplitterComponent> = (args: SplitterComponent) => ({
//   template: `<ngm-splitter [type]="type" style='height: 400px;' [style.width]='"100%"'>
//   <ngm-splitter-pane minSize="50px">
//       <p>
//           Lorem ipsum dolor sit amet, consectetur adipiscing elit. Mauris in lacus eget turpis congue fermentum. Aliquam sollicitudin massa vel ullamcorper bibendum. Donec sit amet augue in justo fermentum facilisis vel quis quam. Vivamus eget iaculis nisi, vitae dignissim leo. Donec eget consectetur lacus. In viverra vehicula libero, quis dictum odio varius in. Phasellus aliquam elit et lectus ornare placerat. Aliquam vitae sapien facilisis, auctor enim quis, consectetur dui. Cras elementum velit eros, ut efficitur ante pellentesque in. Proin vulputate lacus dui, vitae imperdiet dui pharetra ac. Nunc sagittis, sapien et posuere varius, mauris justo tincidunt odio, in interdum lorem libero sed enim. Nulla placerat scelerisque felis vitae accumsan.
//       </p>
//   </ngm-splitter-pane>
//   <ngm-splitter-pane size="100px" minSize="50px">
//       <p>
//           Duis auctor, diam id vehicula consequat, lacus tellus molestie magna, sed varius nisi quam eget nisl. Donec dignissim mi et elementum laoreet. Nam dignissim quis justo eu fermentum. Proin vestibulum, neque quis elementum tincidunt, nibh mi gravida purus, eget volutpat ipsum magna in orci. Donec id mauris vitae lectus molestie blandit. Praesent non quam interdum, efficitur lacus nec, gravida mauris. Ut ac ante maximus, ultrices turpis a, aliquam magna. Praesent blandit ante ut nulla malesuada lobortis. Praesent a lobortis justo. Morbi congue, dui sed ornare faucibus, turpis felis vulputate arcu, lobortis posuere sem leo eget risus. Duis risus augue, dignissim ac tincidunt a, ullamcorper rutrum nisl. Ut ut ipsum vel purus viverra dapibus.
//       </p>
//   </ngm-splitter-pane>
//   <ngm-splitter-pane size="100px" minSize="50px">
//     <p>
//         Duis auctor, diam id vehicula consequat, lacus tellus molestie magna, sed varius nisi quam eget nisl. Donec dignissim mi et elementum laoreet. Nam dignissim quis justo eu fermentum. Proin vestibulum, neque quis elementum tincidunt, nibh mi gravida purus, eget volutpat ipsum magna in orci. Donec id mauris vitae lectus molestie blandit. Praesent non quam interdum, efficitur lacus nec, gravida mauris. Ut ac ante maximus, ultrices turpis a, aliquam magna. Praesent blandit ante ut nulla malesuada lobortis. Praesent a lobortis justo. Morbi congue, dui sed ornare faucibus, turpis felis vulputate arcu, lobortis posuere sem leo eget risus. Duis risus augue, dignissim ac tincidunt a, ullamcorper rutrum nisl. Ut ut ipsum vel purus viverra dapibus.
//     </p>
//   </ngm-splitter-pane>
// </ngm-splitter>`,
//   props: {
//     ...args,
//   },
//   styles: [`.ngm-splitter-pane {overflow: auto;}`]
// })

// export const MultiplePanes = MultiplePanesTemplate.bind({})
// MultiplePanes.args = {
//   type: SplitterType.Vertical
// }

// const NestedPanesTemplate: Story<SplitterComponent> = (args: SplitterComponent) => ({
//   template: `<ngm-splitter [type]="type" style='height: 400px;' [style.width]='"100%"'>
//   <ngm-splitter-pane>
//       <p>
//           Lorem ipsum dolor sit amet, consectetur adipiscing elit. Mauris in lacus eget turpis congue fermentum. Aliquam sollicitudin massa vel ullamcorper bibendum. Donec sit amet augue in justo fermentum facilisis vel quis quam. Vivamus eget iaculis nisi, vitae dignissim leo. Donec eget consectetur lacus. In viverra vehicula libero, quis dictum odio varius in. Phasellus aliquam elit et lectus ornare placerat. Aliquam vitae sapien facilisis, auctor enim quis, consectetur dui. Cras elementum velit eros, ut efficitur ante pellentesque in. Proin vulputate lacus dui, vitae imperdiet dui pharetra ac. Nunc sagittis, sapien et posuere varius, mauris justo tincidunt odio, in interdum lorem libero sed enim. Nulla placerat scelerisque felis vitae accumsan.
//       </p>
//   </ngm-splitter-pane>
//   <ngm-splitter-pane>
//     <ngm-splitter [type]="type" style='height: 100%;' [style.width]='"100%"'>
//       <ngm-splitter-pane>
//           <p>
//               Duis auctor, diam id vehicula consequat, lacus tellus molestie magna, sed varius nisi quam eget nisl. Donec dignissim mi et elementum laoreet. Nam dignissim quis justo eu fermentum. Proin vestibulum, neque quis elementum tincidunt, nibh mi gravida purus, eget volutpat ipsum magna in orci. Donec id mauris vitae lectus molestie blandit. Praesent non quam interdum, efficitur lacus nec, gravida mauris. Ut ac ante maximus, ultrices turpis a, aliquam magna. Praesent blandit ante ut nulla malesuada lobortis. Praesent a lobortis justo. Morbi congue, dui sed ornare faucibus, turpis felis vulputate arcu, lobortis posuere sem leo eget risus. Duis risus augue, dignissim ac tincidunt a, ullamcorper rutrum nisl. Ut ut ipsum vel purus viverra dapibus.
//           </p>
//       </ngm-splitter-pane>
//       <ngm-splitter-pane>
//         <p>
//             Duis auctor, diam id vehicula consequat, lacus tellus molestie magna, sed varius nisi quam eget nisl. Donec dignissim mi et elementum laoreet. Nam dignissim quis justo eu fermentum. Proin vestibulum, neque quis elementum tincidunt, nibh mi gravida purus, eget volutpat ipsum magna in orci. Donec id mauris vitae lectus molestie blandit. Praesent non quam interdum, efficitur lacus nec, gravida mauris. Ut ac ante maximus, ultrices turpis a, aliquam magna. Praesent blandit ante ut nulla malesuada lobortis. Praesent a lobortis justo. Morbi congue, dui sed ornare faucibus, turpis felis vulputate arcu, lobortis posuere sem leo eget risus. Duis risus augue, dignissim ac tincidunt a, ullamcorper rutrum nisl. Ut ut ipsum vel purus viverra dapibus.
//         </p>
//       </ngm-splitter-pane>
//     </ngm-splitter>
//   </ngm-splitter-pane>
// </ngm-splitter>`,
//   props: {
//     ...args,
//   },
//   styles: [`.ngm-splitter-pane {overflow: auto;}`]
// })

// export const NestedPanes = NestedPanesTemplate.bind({})
// NestedPanes.args = {
//   type: SplitterType.Vertical
// }
