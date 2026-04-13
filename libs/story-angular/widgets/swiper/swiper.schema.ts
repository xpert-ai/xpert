import { Injectable } from '@angular/core'
import { FormlyFieldConfig } from '@ngx-formly/core'
import { WidgetComponentType } from '@xpert-ai/story/core'
import { AccordionWrappers, DataSettingsSchemaService, FORMLY_ROW, FORMLY_W_1_2 } from '@xpert-ai/story/designer'
import { WidgetComponentType as IndicatorCardWidgetType } from '@xpert-ai/story/widgets/indicator-card'
import { map, startWith } from 'rxjs/operators'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'

@Injectable()
export class SwiperSchemaService extends DataSettingsSchemaService {
  getSchema() {
    return this.translate.stream('Story').pipe(
      map((STORY_DESIGNER) => {
        this.STORY_DESIGNER = STORY_DESIGNER
        const BUILDER = this.STORY_DESIGNER?.Widgets
        const className = FORMLY_W_1_2
        return [
          {
            key: 'options',
            fieldGroup: [
              {
                wrappers: ['panel'],
                props: {
                  padding: true
                },
                fieldGroupClassName: FORMLY_ROW,
                fieldGroup: [
                  {
                    className,
                    key: 'slidesPerView',
                    type: 'input-inline',
                    defaultValue: 2,
                    props: {
                      label: BUILDER?.Swiper?.SlidesPerView ?? 'Slides PerView',
                      placeholder: `auto,1,2,1.5...`
                    }
                  },
                  {
                    className,
                    key: 'spaceBetween',
                    type: 'input-inline',
                    defaultValue: 10,
                    props: {
                      label: BUILDER?.Swiper?.SpaceBetween ?? 'Space Between',
                      type: 'number'
                    }
                  },
                  // {
                  //   key: 'speed',
                  //   type: 'input',
                  //   props: {
                  //     label: BUILDER?.Swiper?.Speed ?? 'Speed',
                  //     type: 'number'
                  //   }
                  // },
                  {
                    className,
                    key: 'centeredSlides',
                    type: 'checkbox',
                    props: {
                      label: BUILDER?.Swiper?.CenteredSlides ?? 'Centered'
                    }
                  },
                  {
                    className,
                    key: 'direction',
                    type: 'select-inline',
                    props: {
                      label: BUILDER?.Swiper?.Direction ?? 'Direction',
                      options: [
                        { value: 'horizontal', label: BUILDER?.Swiper?.Horizontal ?? 'Horizontal' },
                        { value: 'vertical', label: BUILDER?.Swiper?.Vertical ?? 'Vertical' }
                      ]
                    }
                  },
                  {
                    className,
                    key: 'grabCursor',
                    type: 'checkbox',
                    props: {
                      label: BUILDER?.Swiper?.GrabCursor ?? 'Grab Cursor'
                    }
                  },
                  {
                    className,
                    key: 'mousewheel',
                    type: 'checkbox',
                    props: {
                      label: BUILDER?.Swiper?.Mousewheel ?? 'Mouse Wheel'
                    }
                  },
                  {
                    className,
                    key: 'loop',
                    type: 'checkbox',
                    props: {
                      label: BUILDER?.Swiper?.Loop ?? 'Loop'
                    }
                  },
                  {
                    className,
                    key: 'effect',
                    type: 'select-inline',
                    props: {
                      label: BUILDER?.Swiper?.Effect ?? 'Effect',
                      options: [
                        { value: 'slide', label: BUILDER?.Swiper?.Slide ?? 'Slide' },
                        { value: 'fade', label: BUILDER?.Swiper?.Fade ?? 'Fade' },
                        { value: 'cube', label: BUILDER?.Swiper?.Cube ?? 'Cube' },
                        { value: 'coverflow', label: BUILDER?.Swiper?.Coverflow ?? 'Coverflow' },
                        { value: 'flip', label: BUILDER?.Swiper?.Flip ?? 'Flip' },
                        { value: 'creative', label: BUILDER?.Swiper?.Creative ?? 'Creative' },
                        { value: 'cards', label: BUILDER?.Swiper?.Cards ?? 'Cards' }
                      ]
                    }
                  },
                  {
                    className,
                    key: 'creativeEffect',
                    type: 'select-inline',
                    props: {
                      label: BUILDER?.Swiper?.CreativeEffect ?? 'Creative Effect',
                      compareWith: (o1, o2) => o1?.id === o2?.id,
                      options: [
                        {
                          value: {
                            id: 'creative-1',
                            prev: {
                              shadow: true,
                              translate: [0, 0, -400]
                            },
                            next: {
                              translate: ['100%', 0, 0]
                            }
                          },
                          label: BUILDER?.Swiper?.Creative1 ?? 'Creative 1'
                        },
                        {
                          value: {
                            id: 'creative-2',
                            prev: {
                              shadow: true,
                              translate: ["-120%", 0, -500],
                            },
                            next: {
                              shadow: true,
                              translate: ["120%", 0, -500],
                            },
                          },
                          label: BUILDER?.Swiper?.Creative2 ?? 'Creative 2'
                        },
                        {
                          value: {
                            id: 'creative-3',
                            prev: {
                              shadow: true,
                              translate: ["-20%", 0, -1],
                            },
                            next: {
                              translate: ["100%", 0, 0],
                            },
                          },
                          label: BUILDER?.Swiper?.Creative3 ?? 'Creative 3'
                        },
                        {
                          value: {
                            id: 'creative-4',
                            prev: {
                              shadow: true,
                              translate: [0, 0, -800],
                              rotate: [180, 0, 0],
                            },
                            next: {
                              shadow: true,
                              translate: [0, 0, -800],
                              rotate: [-180, 0, 0],
                            },
                          },
                          label: BUILDER?.Swiper?.Creative4 ?? 'Creative 4'
                        },
                        {
                          value: {
                            id: 'creative-5',
                            prev: {
                              shadow: true,
                              translate: ["-125%", 0, -800],
                              rotate: [0, 0, -90],
                            },
                            next: {
                              shadow: true,
                              translate: ["125%", 0, -800],
                              rotate: [0, 0, 90],
                            },
                          },
                          label: BUILDER?.Swiper?.Creative5 ?? 'Creative 5'
                        },
                        {
                          value: {
                            id: 'creative-6',
                            prev: {
                              shadow: true,
                              origin: 'left center',
                              translate: ['-5%', 0, -200],
                              rotate: [0, 100, 0]
                            },
                            next: {
                              origin: 'right center',
                              translate: ['5%', 0, -200],
                              rotate: [0, -100, 0]
                            }
                          },
                          label: BUILDER?.Swiper?.Creative6 ?? 'Creative 6'
                        }
                      ]
                    },
                    expressions: {
                      hide: `!model || model.effect !== 'creative'`
                    }
                  }
                  // {
                  //   className: FORMLY_W_1_3,
                  //   key: 'virtual',
                  //   type: 'checkbox',
                  //   props: {
                  //     label: BUILDER?.Swiper?.Virtual ?? 'Virtual'
                  //   }
                  // },
                  // {
                  //   className: FORMLY_W_1_3,
                  //   key: 'touchStartPreventDefault',
                  //   type: 'checkbox',
                  //   props: {
                  //     label: BUILDER?.Swiper?.TouchStartPreventDefault ?? 'Touch Start Prevent Default'
                  //   }
                  // }
                ]
              },

              {
                key: 'slides',
                type: 'table-inline',
                wrappers: ['panel'],
                props: {
                  label: BUILDER?.Swiper?.Slides ?? 'Slides',
                  padding: true
                },
                fieldArray: {
                  fieldGroupClassName: FORMLY_ROW,
                  fieldGroup: [
                    {
                      key: 'type',
                      type: 'select-inline',
                      props: {
                        title: BUILDER?.Common?.ComponentType ?? 'Component Type',
                        options: [
                          {
                            value: IndicatorCardWidgetType.IndicatorCard,
                            label: BUILDER?.Common?.IndicatorCard ?? 'Indicator Card'
                          },
                          {
                            value: WidgetComponentType.AnalyticalCard,
                            label: BUILDER?.Common?.AnalyticalCard ?? 'Analytical Card'
                          },
                          {
                            value: WidgetComponentType.AnalyticalGrid,
                            label: BUILDER?.Common?.AnalyticalGrid ?? 'Analytical Grid'
                          }
                        ]
                      }
                    },
                    {
                      key: 'options',
                      type: 'designer',
                      defaultValue: {},
                      props: {
                        title: BUILDER?.Swiper?.Details ?? 'Details',
                        liveMode: true
                      },
                      hooks: {
                        onInit: (field: FormlyFieldConfig) => {
                          field.props.designer = field.parent.formControl.valueChanges.pipe(
                            startWith(field.parent.model),
                            map((value) => value.type),
                            takeUntilDestroyed(this.destroyRef)
                          )
                        }
                      }
                    }
                  ]
                }
              },

              ...AccordionWrappers([
                {
                  showKey: 'enableAutoplay',
                  key: 'autoplay',
                  label: BUILDER?.Swiper?.Autoplay ?? 'Autoplay',
                  fieldGroup: [
                    {
                      fieldGroupClassName: FORMLY_ROW,
                      fieldGroup: [
                        {
                          className,
                          key: 'delay',
                          type: 'slider',
                          defaultValue: 300,
                          props: {
                            label: BUILDER?.Swiper?.Delay ?? 'Delay',
                            min: 100,
                            max: 1000,
                            step: 100,
                            thumbLabel: true,
                            autoScale: true
                          }
                        },
                        {
                          className,
                          key: 'disableOnInteraction',
                          type: 'checkbox',
                          props: {
                            label: BUILDER?.Swiper?.DisableOnInteraction ?? 'Disable On Interaction'
                          }
                        },
                        {
                          className,
                          key: 'pauseOnMouseEnter',
                          type: 'checkbox',
                          props: {
                            label: BUILDER?.Swiper?.PauseOnMouseEnter ?? 'Pause On Mouse Enter'
                          }
                        },
                        {
                          className,
                          key: 'reverseDirection',
                          type: 'checkbox',
                          props: {
                            label: BUILDER?.Swiper?.ReverseDirection ?? 'Reverse Direction'
                          }
                        },
                        {
                          className,
                          key: 'stopOnLastSlide',
                          type: 'checkbox',
                          props: {
                            label: BUILDER?.Swiper?.StopOnLastSlide ?? 'Stop On Last Slide'
                          }
                        },
                        {
                          className,
                          key: 'waitForTransition',
                          type: 'checkbox',
                          props: {
                            label: BUILDER?.Swiper?.WaitForTransition ?? 'Wait For Transition'
                          }
                        }
                      ]
                    }
                  ]
                },
                {
                  showKey: 'enablePagination',
                  key: 'pagination',
                  label: BUILDER?.Swiper?.Pagination ?? 'Pagination',
                  fieldGroup: [
                    {
                      fieldGroupClassName: FORMLY_ROW,
                      fieldGroup: [
                        {
                          className,
                          key: 'enabled',
                          type: 'toggle',
                          props: {
                            label: BUILDER?.Swiper?.Enabled ?? 'Enabled',
                          }
                        },
                        {
                          className,
                          key: 'type',
                          type: 'select-inline',
                          props: {
                            label: BUILDER?.Swiper?.Type ?? 'Type',
                            options: [
                              { value: 'bullets', label: BUILDER?.Swiper?.Bullets ?? 'Bullets' },
                              { value: 'fraction', label: BUILDER?.Swiper?.Fraction ?? 'Fraction' },
                              { value: 'progressbar', label: BUILDER?.Swiper?.Progressbar ?? 'Progressbar' }
                            ]
                          }
                        },
                        {
                          className,
                          key: 'clickable',
                          type: 'checkbox',
                          props: {
                            label: BUILDER?.Swiper?.Clickable ?? 'Clickable'
                          }
                        },
                        {
                          className,
                          key: 'hideOnClick',
                          type: 'checkbox',
                          props: {
                            label: BUILDER?.Swiper?.HideOnClick ?? 'Hide on Click'
                          }
                        },
                        {
                          className,
                          key: 'dynamicBullets',
                          type: 'checkbox',
                          props: {
                            label: BUILDER?.Swiper?.DynamicBullets ?? 'Dynamic Bullets'
                          }
                        },
                      ]
                    }
                  ]
                },
                {
                  showKey: 'enableKeyboard',
                  key: 'keyboard',
                  label: BUILDER?.Swiper?.KeyboardControl ?? 'Keyboard Control',
                  fieldGroup: [
                    {
                      fieldGroupClassName: FORMLY_ROW,
                      fieldGroup: [
                        {
                          className,
                          key: 'enabled',
                          type: 'checkbox',
                          props: {
                            label: BUILDER?.Swiper?.Enabled ?? 'Enabled',
                          }
                        },
                        {
                          className,
                          key: 'onlyInViewport',
                          type: 'checkbox',
                          props: {
                            label: BUILDER?.Swiper?.OnlyInViewport ?? 'Only In Viewport',
                          }
                        },
                        {
                          className,
                          key: 'pageUpDown',
                          type: 'checkbox',
                          props: {
                            label: BUILDER?.Swiper?.PageUpDown ?? 'Page Up Down',
                          }
                        },
                      ]
                    }
                  ]
                }
              ]),

              {
                fieldGroupClassName: FORMLY_ROW,
                key: 'breakpoints',
                type: 'table-inline',
                wrappers: ['accordion'],
                props: {
                  label: BUILDER?.Swiper?.Breakpoints ?? 'Breakpoints',
                  expanded: true
                },
                fieldArray: {
                  fieldGroup: [
                    {
                      key: 'size',
                      type: 'input-inline',
                      props: {
                        title: BUILDER?.Swiper?.BreakpointSize ?? 'Breakpoint Size',
                        type: 'number'
                      }
                    },
                    {
                      key: 'slidesPerView',
                      type: 'input-inline',
                      props: {
                        title: BUILDER?.Swiper?.SlidesPerView ?? 'Slides PerView',
                        type: 'number'
                      }
                    },
                    {
                      key: 'spaceBetween',
                      type: 'input-inline',
                      props: {
                        title: BUILDER?.Swiper?.SpaceBetween ?? 'Space Between',
                        type: 'number'
                      }
                    },
                    {
                      key: 'touchRatio',
                      type: 'input-inline',
                      props: {
                        title: BUILDER?.Swiper?.TouchRatio ?? 'Touch Ratio',
                        type: 'number'
                      }
                    }
                  ]
                }
              }

            ]
          }
        ]
      })
    )
  }
}
