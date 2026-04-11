import { provideHttpClient } from '@angular/common/http'
import { provideAnimations } from '@angular/platform-browser/animations'
import { DisplayDensity } from '@xpert-ai/ocap-angular/core'
import { provideOcapMock, provideTranslate } from '@xpert-ai/ocap-angular/mock'
import { FilterSelectionType, ParameterControlEnum } from '@xpert-ai/ocap-core'
import { Meta, applicationConfig, moduleMetadata } from '@storybook/angular'
import { NgmParameterComponent } from './parameter.component'

const meta: Meta<NgmParameterComponent> = {
  title: 'Parameter/ParameterComponent',
  component: NgmParameterComponent,
  decorators: [
    applicationConfig({
      providers: [provideAnimations(), provideHttpClient(), provideOcapMock(), provideTranslate()]
    }),
    moduleMetadata({
      imports: [NgmParameterComponent],
      providers: []
    })
  ]
}

export default meta

const AVAILABLE_MEMBERS = [
  {
    value: 1,
    label: 'Department A'
  },
  {
    value: 2,
    label: 'Department B'
  },
  {
    value: 3,
    label: 'Department C'
  }
]

export const Primary = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder'
    },
    parameter: {
      name: 'DepartmentSelector',
      paramType: ParameterControlEnum.Dimensions,
      dimension: '[Department]',
      availableMembers: AVAILABLE_MEMBERS
    }
  }
}

export const PrimaryCompact = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder'
    },
    parameter: {
      name: 'DepartmentSelector',
      paramType: ParameterControlEnum.Dimensions,
      dimension: '[Department]'
    },
    appearance: {
      displayDensity: DisplayDensity.compact
    }
  }
}

export const PrimaryMultiple = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder'
    },
    parameter: {
      name: 'DepartmentSelector',
      paramType: ParameterControlEnum.Dimensions,
      dimension: '[Department]'
    },
    appearance: {
      displayDensity: DisplayDensity.compact
    },
    options: {
      selectionType: FilterSelectionType.Multiple
    }
  }
}

export const ParameterInput = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder'
    },
    parameter: {
      name: 'DepartmentInput',
      paramType: ParameterControlEnum.Input
    }
  }
}

export const ParameterInputNumber = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder'
    },
    parameter: {
      name: 'DepartmentInput',
      paramType: ParameterControlEnum.Input,
      dataType: 'number'
    }
  }
}

export const ParameterInputString = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder'
    },
    parameter: {
      name: 'DepartmentInput',
      paramType: ParameterControlEnum.Input,
      dataType: 'string'
    }
  }
}

export const ParameterSelect = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder'
    },
    parameter: {
      name: 'DepartmentSelect',
      paramType: ParameterControlEnum.Select,
      availableMembers: AVAILABLE_MEMBERS
    }
  }
}

export const ParameterSelectDensity = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder'
    },
    parameter: {
      name: 'DepartmentSelect',
      paramType: ParameterControlEnum.Select,
      availableMembers: AVAILABLE_MEMBERS
    },
    appearance: {
      displayDensity: DisplayDensity.compact
    }
  }
}

export const ParameterSelectMultiple = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder'
    },
    parameter: {
      name: 'DepartmentSelect',
      paramType: ParameterControlEnum.Select,
      availableMembers: AVAILABLE_MEMBERS
    },
    appearance: {
      displayDensity: DisplayDensity.compact
    },
    options: {
      selectionType: FilterSelectionType.Multiple
    }
  }
}

export const Slider = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder'
    },
    parameter: {
      name: 'SliderParam',
      paramType: ParameterControlEnum.Input,
      dataType: 'number',
      value: 6
    },
    options: {
      slider: true,
      sliderMax: 10,
      sliderStep: 2,
      sliderInvert: true
    }
  }
}

export const SliderVertical = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder'
    },
    parameter: {
      name: 'SliderParam',
      paramType: ParameterControlEnum.Input,
      dataType: 'number',
      value: 6
    },
    options: {
      slider: true,
      sliderMax: 10,
      sliderStep: 2,
      sliderVertical: true
    }
  }
}
