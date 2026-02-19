import { register } from '../base'
import { DBProtocolEnum, DBSyntaxEnum } from '../types'
import { XMLA } from './xmla'

export class SAPBW extends XMLA {
  static type = 'sapbw'

  name = 'SAP BW (OLAP)'
  type = SAPBW.type
  syntax = DBSyntaxEnum.MDX
  protocol = DBProtocolEnum.XMLA
}

register(SAPBW.type, SAPBW)
