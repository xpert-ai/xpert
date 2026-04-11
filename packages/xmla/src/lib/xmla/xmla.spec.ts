import { Agent, AgentStatus, AgentType, DataSourceOptions } from '@xpert-ai/ocap-core'
import { merge } from 'lodash'
import { map, Observable } from 'rxjs'
import { Dataset } from '../types'
import { fetchDataFromMultidimensionalTuple } from './multidimensional'
import { Xmla } from './Xmla'

export class MockAgent implements Agent {
  type: AgentType
  selectStatus(): Observable<AgentStatus> {
    throw new Error('Method not implemented.')
  }
  selectError(): Observable<any> {
    throw new Error('Method not implemented.')
  }
  error(err: any): void {
    throw new Error('Method not implemented.')
  }
  request(dataSource: DataSourceOptions, options: any): Promise<any> {
    // console.log(dataSource, options)
    return Promise.resolve(RESPONSE)
  }
}

const agent = new MockAgent()

const xmla = new Xmla({
  url: `/`, // Mock
  agent: agent
})

describe('Xmla', () => {
  it('#Basic', (done) => {
    const statement = `WITH 
    MEMBER [Measures].[Sales_MA] AS AVG(LastPeriods(5, [Time].CurrentMember), [Measures].[Sales])
    MEMBER [Measures].[Sales_MA_Forward] AS AVG(LastPeriods(-5, [Time].CurrentMember), [Measures].[Sales])
SELECT
    non empty {[Measures].[Sales], [Measures].[Sales_MA], [Measures].[Sales_MA_Forward]} ON COLUMNS,
    non empty {Descendants( {[Time].[2020].[Q2].[5]:[Time].[2022].[Q2].[5]}, [Time].[Month] )} ON ROWS
FROM [Sales] `

    const options = {}

    const result$ = new Observable<Dataset>((subscriber) => {
      const _options = merge(
        {
          properties: {
            DataSourceInfo: ''
          }
        },
        options
      )
      xmla.execute({
        statement,
        ..._options,
        success: (xmla, ops, response) => {
          subscriber.next(response)
          subscriber.complete()
        },
        error: (err, exception) => {
          subscriber.error(exception)
        }
      })
    })

    result$.pipe(map((dataset: Dataset) => fetchDataFromMultidimensionalTuple(dataset))).subscribe((value) => {
    //   console.log(value.data)
      expect(value.data[value.data.length - 1]).toEqual({
        Sales_MA: 113787.84000000003,
        '[Time]': '[2022].[Q1].[3]',
        '[Time].[DISPLAY_INFO]': 131103,
        '[Time].[LEVEL_NUMBER]': 3,
        '[Time].[LEVEL_UNIQUE_NAME]': '[Time].[Month]',
        '[Time].[MEMBER_CAPTION]': 'March',
        '[Time].[MEMBER_UNIQUE_NAME]': '[Time].[2022].[Q1].[3]',
        '[Time]_Text': 'March',
        hierarchy: 'Time',
        index: 0
      })
      done()
    })
  })
})

const RESPONSE = `<?xml version="1.0" encoding="ISO-8859-1"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" >
<SOAP-ENV:Header>
</SOAP-ENV:Header>
<SOAP-ENV:Body>
<cxmla:ExecuteResponse xmlns:cxmla="urn:schemas-microsoft-com:xml-analysis">
  <cxmla:return>
    <root xmlns="urn:schemas-microsoft-com:xml-analysis:mddataset" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:EX="urn:schemas-microsoft-com:xml-analysis:exception">
      <xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:schemas-microsoft-com:xml-analysis:mddataset" xmlns="urn:schemas-microsoft-com:xml-analysis:mddataset" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:sql="urn:schemas-microsoft-com:xml-sql" elementFormDefault="qualified">
        <xsd:complexType name="MemberType">
          <xsd:sequence>
            <xsd:element name="UName" type="xsd:string"/>
            <xsd:element name="Caption" type="xsd:string"/>
            <xsd:element name="LName" type="xsd:string"/>
            <xsd:element name="LNum" type="xsd:unsignedInt"/>
            <xsd:element name="DisplayInfo" type="xsd:unsignedInt"/>
            <xsd:sequence maxOccurs="unbounded" minOccurs="0">
              <xsd:any processContents="lax" maxOccurs="unbounded"/>
            </xsd:sequence>
          </xsd:sequence>
          <xsd:attribute name="Hierarchy" type="xsd:string"/>
        </xsd:complexType>
        <xsd:complexType name="PropType">
          <xsd:attribute name="name" type="xsd:string"/>
        </xsd:complexType>
        <xsd:complexType name="TupleType">
          <xsd:sequence maxOccurs="unbounded">
            <xsd:element name="Member" type="MemberType"/>
          </xsd:sequence>
        </xsd:complexType>
        <xsd:complexType name="MembersType">
          <xsd:sequence maxOccurs="unbounded">
            <xsd:element name="Member" type="MemberType"/>
          </xsd:sequence>
          <xsd:attribute name="Hierarchy" type="xsd:string"/>
        </xsd:complexType>
        <xsd:complexType name="TuplesType">
          <xsd:sequence maxOccurs="unbounded">
            <xsd:element name="Tuple" type="TupleType"/>
          </xsd:sequence>
        </xsd:complexType>
        <xsd:complexType name="CrossProductType">
          <xsd:sequence>
            <xsd:choice minOccurs="0" maxOccurs="unbounded">
              <xsd:element name="Members" type="MembersType"/>
              <xsd:element name="Tuples" type="TuplesType"/>
            </xsd:choice>
          </xsd:sequence>
          <xsd:attribute name="Size" type="xsd:unsignedInt"/>
        </xsd:complexType>
        <xsd:complexType name="OlapInfo">
          <xsd:sequence>
            <xsd:element name="CubeInfo">
              <xsd:complexType>
                <xsd:sequence>
                  <xsd:element name="Cube" maxOccurs="unbounded">
                    <xsd:complexType>
                      <xsd:sequence>
                        <xsd:element name="CubeName" type="xsd:string"/>
                      </xsd:sequence>
                    </xsd:complexType>
                  </xsd:element>
                </xsd:sequence>
              </xsd:complexType>
            </xsd:element>
            <xsd:element name="AxesInfo">
              <xsd:complexType>
                <xsd:sequence>
                  <xsd:element name="AxisInfo" maxOccurs="unbounded">
                    <xsd:complexType>
                      <xsd:sequence>
                        <xsd:element name="HierarchyInfo" minOccurs="0" maxOccurs="unbounded">
                          <xsd:complexType>
                            <xsd:sequence>
                              <xsd:sequence maxOccurs="unbounded">
                                <xsd:element name="UName" type="PropType"/>
                                <xsd:element name="Caption" type="PropType"/>
                                <xsd:element name="LName" type="PropType"/>
                                <xsd:element name="LNum" type="PropType"/>
                                <xsd:element name="DisplayInfo" type="PropType" minOccurs="0" maxOccurs="unbounded"/>
                              </xsd:sequence>
                              <xsd:sequence>
                                <xsd:any processContents="lax" minOccurs="0" maxOccurs="unbounded"/>
                              </xsd:sequence>
                            </xsd:sequence>
                            <xsd:attribute name="name" type="xsd:string" use="required"/>
                          </xsd:complexType>
                        </xsd:element>
                      </xsd:sequence>
                      <xsd:attribute name="name" type="xsd:string"/>
                    </xsd:complexType>
                  </xsd:element>
                </xsd:sequence>
              </xsd:complexType>
            </xsd:element>
            <xsd:element name="CellInfo">
              <xsd:complexType>
                <xsd:sequence>
                  <xsd:sequence minOccurs="0" maxOccurs="unbounded">
                    <xsd:choice>
                      <xsd:element name="Value" type="PropType"/>
                      <xsd:element name="FmtValue" type="PropType"/>
                      <xsd:element name="BackColor" type="PropType"/>
                      <xsd:element name="ForeColor" type="PropType"/>
                      <xsd:element name="FontName" type="PropType"/>
                      <xsd:element name="FontSize" type="PropType"/>
                      <xsd:element name="FontFlags" type="PropType"/>
                      <xsd:element name="FormatString" type="PropType"/>
                      <xsd:element name="NonEmptyBehavior" type="PropType"/>
                      <xsd:element name="SolveOrder" type="PropType"/>
                      <xsd:element name="Updateable" type="PropType"/>
                      <xsd:element name="Visible" type="PropType"/>
                      <xsd:element name="Expression" type="PropType"/>
                    </xsd:choice>
                  </xsd:sequence>
                  <xsd:sequence maxOccurs="unbounded" minOccurs="0">
                    <xsd:any processContents="lax" maxOccurs="unbounded"/>
                  </xsd:sequence>
                </xsd:sequence>
              </xsd:complexType>
            </xsd:element>
          </xsd:sequence>
        </xsd:complexType>
        <xsd:complexType name="Axes">
          <xsd:sequence maxOccurs="unbounded">
            <xsd:element name="Axis">
              <xsd:complexType>
                <xsd:choice minOccurs="0" maxOccurs="unbounded">
                  <xsd:element name="CrossProduct" type="CrossProductType"/>
                  <xsd:element name="Tuples" type="TuplesType"/>
                  <xsd:element name="Members" type="MembersType"/>
                </xsd:choice>
                <xsd:attribute name="name" type="xsd:string"/>
              </xsd:complexType>
            </xsd:element>
          </xsd:sequence>
        </xsd:complexType>
        <xsd:complexType name="CellData">
          <xsd:sequence>
            <xsd:element name="Cell" minOccurs="0" maxOccurs="unbounded">
              <xsd:complexType>
                <xsd:sequence maxOccurs="unbounded">
                  <xsd:choice>
                    <xsd:element name="Value"/>
                    <xsd:element name="FmtValue" type="xsd:string"/>
                    <xsd:element name="BackColor" type="xsd:unsignedInt"/>
                    <xsd:element name="ForeColor" type="xsd:unsignedInt"/>
                    <xsd:element name="FontName" type="xsd:string"/>
                    <xsd:element name="FontSize" type="xsd:unsignedShort"/>
                    <xsd:element name="FontFlags" type="xsd:unsignedInt"/>
                    <xsd:element name="FormatString" type="xsd:string"/>
                    <xsd:element name="NonEmptyBehavior" type="xsd:unsignedShort"/>
                    <xsd:element name="SolveOrder" type="xsd:unsignedInt"/>
                    <xsd:element name="Updateable" type="xsd:unsignedInt"/>
                    <xsd:element name="Visible" type="xsd:unsignedInt"/>
                    <xsd:element name="Expression" type="xsd:string"/>
                  </xsd:choice>
                </xsd:sequence>
                <xsd:attribute name="CellOrdinal" type="xsd:unsignedInt" use="required"/>
              </xsd:complexType>
            </xsd:element>
          </xsd:sequence>
        </xsd:complexType>
        <xsd:element name="root">
          <xsd:complexType>
            <xsd:sequence maxOccurs="unbounded">
              <xsd:element name="OlapInfo" type="OlapInfo"/>
              <xsd:element name="Axes" type="Axes"/>
              <xsd:element name="CellData" type="CellData"/>
            </xsd:sequence>
          </xsd:complexType>
        </xsd:element>
      </xsd:schema>
      <OlapInfo>
        <CubeInfo>
          <Cube>
            <CubeName>Sales</CubeName>
          </Cube>
        </CubeInfo>
        <AxesInfo>
          <AxisInfo name="Axis0">
            <HierarchyInfo name="Measures">
              <UName name="[Measures].[MEMBER_UNIQUE_NAME]"/>
              <Caption name="[Measures].[MEMBER_CAPTION]"/>
              <LName name="[Measures].[LEVEL_UNIQUE_NAME]"/>
              <LNum name="[Measures].[LEVEL_NUMBER]"/>
              <DisplayInfo name="[Measures].[DISPLAY_INFO]"/>
            </HierarchyInfo>
          </AxisInfo>
          <AxisInfo name="Axis1">
            <HierarchyInfo name="Time">
              <UName name="[Time].[MEMBER_UNIQUE_NAME]"/>
              <Caption name="[Time].[MEMBER_CAPTION]"/>
              <LName name="[Time].[LEVEL_UNIQUE_NAME]"/>
              <LNum name="[Time].[LEVEL_NUMBER]"/>
              <DisplayInfo name="[Time].[DISPLAY_INFO]"/>
            </HierarchyInfo>
          </AxisInfo>
          <AxisInfo name="SlicerAxis"/>
        </AxesInfo>
        <CellInfo>
          <Value name="VALUE"/>
          <FmtValue name="FORMATTED_VALUE"/>
          <FormatString name="FORMAT_STRING"/>
        </CellInfo>
      </OlapInfo>
      <Axes>
        <Axis name="Axis0">
          <Tuples>
            <Tuple>
              <Member Hierarchy="Measures">
                <UName>[Measures].[Sales]</UName>
                <Caption>Sales</Caption>
                <LName>[Measures].[MeasuresLevel]</LName>
                <LNum>0</LNum>
                <DisplayInfo>0</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Measures">
                <UName>[Measures].[Sales_MA]</UName>
                <Caption>Sales_MA</Caption>
                <LName>[Measures].[MeasuresLevel]</LName>
                <LNum>0</LNum>
                <DisplayInfo>0</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Measures">
                <UName>[Measures].[Sales_MA_Forward]</UName>
                <Caption>Sales_MA_Forward</Caption>
                <LName>[Measures].[MeasuresLevel]</LName>
                <LNum>0</LNum>
                <DisplayInfo>0</DisplayInfo>
              </Member>
            </Tuple>
          </Tuples>
        </Axis>
        <Axis name="Axis1">
          <Tuples>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2020].[Q2].[5]</UName>
                <Caption>May</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>31</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2020].[Q2].[6]</UName>
                <Caption>June</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>131102</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2020].[Q3].[7]</UName>
                <Caption>July</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>31</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2020].[Q3].[8]</UName>
                <Caption>August</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>131103</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2020].[Q3].[9]</UName>
                <Caption>September</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>131102</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2020].[Q4].[10]</UName>
                <Caption>October</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>31</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2020].[Q4].[11]</UName>
                <Caption>November</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>131102</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2020].[Q4].[12]</UName>
                <Caption>December</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>131103</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2021].[Q1].[1]</UName>
                <Caption>January</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>31</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2021].[Q1].[2]</UName>
                <Caption>February</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>131100</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2021].[Q1].[3]</UName>
                <Caption>March</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>131103</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2021].[Q2].[4]</UName>
                <Caption>April</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>30</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2021].[Q2].[5]</UName>
                <Caption>May</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>131103</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2021].[Q2].[6]</UName>
                <Caption>June</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>131102</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2021].[Q3].[7]</UName>
                <Caption>July</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>31</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2021].[Q3].[8]</UName>
                <Caption>August</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>131103</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2021].[Q3].[9]</UName>
                <Caption>September</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>131102</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2021].[Q4].[10]</UName>
                <Caption>October</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>31</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2021].[Q4].[11]</UName>
                <Caption>November</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>131102</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2021].[Q4].[12]</UName>
                <Caption>December</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>131103</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2022].[Q1].[1]</UName>
                <Caption>January</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>31</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2022].[Q1].[2]</UName>
                <Caption>February</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>131100</DisplayInfo>
              </Member>
            </Tuple>
            <Tuple>
              <Member Hierarchy="Time">
                <UName>[Time].[2022].[Q1].[3]</UName>
                <Caption>March</Caption>
                <LName>[Time].[Month]</LName>
                <LNum>3</LNum>
                <DisplayInfo>131103</DisplayInfo>
              </Member>
            </Tuple>
          </Tuples>
        </Axis>
        <Axis name="SlicerAxis">
          <Tuples>
            <Tuple/>
          </Tuples>
        </Axis>
      </Axes>
      <CellData>
        <Cell CellOrdinal="0">
          <Value xsi:type="xsd:double">44456.29000000002</Value>
          <FmtValue>44,456.29</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="1">
          <Value xsi:type="xsd:double">45392.577999999994</Value>
          <FmtValue>45,392.578</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="2">
          <Value xsi:type="xsd:double">46011.981999999996</Value>
          <FmtValue>46,011.982</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="3">
          <Value xsi:type="xsd:double">45331.72999999994</Value>
          <FmtValue>45,331.73</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="4">
          <Value xsi:type="xsd:double">45350.98599999996</Value>
          <FmtValue>45,350.986</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="5">
          <Value xsi:type="xsd:double">45589.177999999956</Value>
          <FmtValue>45,589.178</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="6">
          <Value xsi:type="xsd:double">50246.88</Value>
          <FmtValue>50,246.88</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="7">
          <Value xsi:type="xsd:double">46588.60399999997</Value>
          <FmtValue>46,588.604</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="8">
          <Value xsi:type="xsd:double">47195.57399999996</Value>
          <FmtValue>47,195.574</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="9">
          <Value xsi:type="xsd:double">46199.04000000004</Value>
          <FmtValue>46,199.04</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="10">
          <Value xsi:type="xsd:double">45822.43799999998</Value>
          <FmtValue>45,822.438</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="11">
          <Value xsi:type="xsd:double">48539.32599999994</Value>
          <FmtValue>48,539.326</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="12">
          <Value xsi:type="xsd:double">43825.96999999997</Value>
          <FmtValue>43,825.97</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="13">
          <Value xsi:type="xsd:double">46011.981999999996</Value>
          <FmtValue>46,011.982</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="14">
          <Value xsi:type="xsd:double">58930.574</Value>
          <FmtValue></FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="15">
          <Value xsi:type="xsd:double">42342.269999999844</Value>
          <FmtValue>42,342.27</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="16">
          <Value xsi:type="xsd:double">45589.177999999956</Value>
          <FmtValue>45,589.178</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="17">
          <Value xsi:type="xsd:double">69064.98000000001</Value>
          <FmtValue>69,064.98</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="18">
          <Value xsi:type="xsd:double">53363.709999999934</Value>
          <FmtValue>53,363.71</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="19">
          <Value xsi:type="xsd:double">47195.57399999996</Value>
          <FmtValue>47,195.574</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="20">
          <Value xsi:type="xsd:double">80240.50600000002</Value>
          <FmtValue>80,240.506</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="21">
          <Value xsi:type="xsd:double">56965.639999999934</Value>
          <FmtValue>56,965.64</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="22">
          <Value xsi:type="xsd:double">48539.32599999994</Value>
          <FmtValue>48,539.326</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="23">
          <Value xsi:type="xsd:double">88522.992</Value>
          <FmtValue>88,522.992</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="24">
          <Value xsi:type="xsd:double">98155.28000000032</Value>
          <FmtValue>98,155.28</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="25">
          <Value xsi:type="xsd:double">58930.574</Value>
          <FmtValue>58,930.574</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="26">
          <Value xsi:type="xsd:double">96166.626</Value>
          <FmtValue>96,166.626</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="27">
          <Value xsi:type="xsd:double">94497.99999999997</Value>
          <FmtValue>94,498</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="28">
          <Value xsi:type="xsd:double">69064.98000000001</Value>
          <FmtValue>69,064.98</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="29">
          <Value xsi:type="xsd:double">95945.57799999989</Value>
          <FmtValue>95,945.578</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="30">
          <Value xsi:type="xsd:double">98219.89999999997</Value>
          <FmtValue>98,219.9</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="31">
          <Value xsi:type="xsd:double">80240.50600000002</Value>
          <FmtValue>80,240.506</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="32">
          <Value xsi:type="xsd:double">96834.66599999987</Value>
          <FmtValue>96,834.666</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="33">
          <Value xsi:type="xsd:double">94776.13999999978</Value>
          <FmtValue>94,776.14</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="34">
          <Value xsi:type="xsd:double">88522.992</Value>
          <FmtValue>88,522.992</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="35">
          <Value xsi:type="xsd:double">96134.38799999985</Value>
          <FmtValue>96,134.388</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="36">
          <Value xsi:type="xsd:double">95183.80999999991</Value>
          <FmtValue>95,183.81</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="37">
          <Value xsi:type="xsd:double">96166.626</Value>
          <FmtValue>96,166.626</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="38">
          <Value xsi:type="xsd:double">97454.87999999989</Value>
          <FmtValue>97,454.88</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="39">
          <Value xsi:type="xsd:double">97050.03999999985</Value>
          <FmtValue>97,050.04</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="40">
          <Value xsi:type="xsd:double">95945.57799999989</Value>
          <FmtValue>95,945.578</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="41">
          <Value xsi:type="xsd:double">96905.29999999989</Value>
          <FmtValue>96,905.3</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="42">
          <Value xsi:type="xsd:double">98943.43999999983</Value>
          <FmtValue>98,943.44</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="43">
          <Value xsi:type="xsd:double">96834.66599999987</Value>
          <FmtValue>96,834.666</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="44">
          <Value xsi:type="xsd:double">100252.8599999999</Value>
          <FmtValue>100,252.86</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="45">
          <Value xsi:type="xsd:double">94718.50999999992</Value>
          <FmtValue>94,718.51</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="46">
          <Value xsi:type="xsd:double">96134.38799999985</Value>
          <FmtValue>96,134.388</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="47">
          <Value xsi:type="xsd:double">100580.21499999992</Value>
          <FmtValue>100,580.215</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="48">
          <Value xsi:type="xsd:double">101378.59999999995</Value>
          <FmtValue>101,378.6</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="49">
          <Value xsi:type="xsd:double">97454.87999999989</Value>
          <FmtValue>97,454.88</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="50">
          <Value xsi:type="xsd:double">102534.11666666658</Value>
          <FmtValue>102,534.117</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="51">
          <Value xsi:type="xsd:double">92435.9099999998</Value>
          <FmtValue>92,435.91</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="52">
          <Value xsi:type="xsd:double">96905.29999999989</Value>
          <FmtValue>96,905.3</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="53">
          <Value xsi:type="xsd:double">103111.87499999991</Value>
          <FmtValue>103,111.875</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="54">
          <Value xsi:type="xsd:double">113787.84000000003</Value>
          <FmtValue>113,787.84</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="55">
          <Value xsi:type="xsd:double">100252.8599999999</Value>
          <FmtValue>100,252.86</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="56">
          <Value xsi:type="xsd:double">113787.84000000003</Value>
          <FmtValue>113,787.84</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="58">
          <Value xsi:type="xsd:double">100580.21499999992</Value>
          <FmtValue>100,580.215</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="61">
          <Value xsi:type="xsd:double">102534.11666666658</Value>
          <FmtValue>102,534.117</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="64">
          <Value xsi:type="xsd:double">103111.87499999991</Value>
          <FmtValue>103,111.875</FmtValue>
          <FormatString/>
        </Cell>
        <Cell CellOrdinal="67">
          <Value xsi:type="xsd:double">113787.84000000003</Value>
          <FmtValue>113,787.84</FmtValue>
          <FormatString/>
        </Cell>
      </CellData>
    </root>
  </cxmla:return>
</cxmla:ExecuteResponse>
</SOAP-ENV:Body>
</SOAP-ENV:Envelope>`
