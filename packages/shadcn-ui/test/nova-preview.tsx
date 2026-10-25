import { createRoot } from 'react-dom/client'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toggle,
  installShadcnThemeVars
} from '../src'

const query = new URLSearchParams(location.search)
const dark = query.get('theme') === 'dark'
const root = document.documentElement
root.classList.toggle('dark', dark)
const tokens = {
  colorBackground: dark ? '#0a0a0a' : '#ffffff',
  colorForeground: dark ? '#fafafa' : '#171717',
  colorCard: dark ? '#171717' : '#ffffff',
  colorPopover: dark ? '#171717' : '#ffffff',
  colorMuted: dark ? '#262626' : '#f5f5f5',
  colorMutedForeground: dark ? '#a3a3a3' : '#737373',
  colorPrimary: dark ? '#fafafa' : '#171717',
  colorPrimaryForeground: dark ? '#171717' : '#fafafa',
  colorBorder: dark ? '#404040' : '#e5e5e5',
  colorInput: dark ? '#404040' : '#e5e5e5',
  colorRing: '#a3a3a3',
  radiusLg: query.get('radius') ?? '0.625rem',
  densityRootFontSize: '14px'
}
for (const [key, value] of Object.entries(tokens)) {
  root.style.setProperty(`--xui-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, value)
}
installShadcnThemeVars({ density: query.get('density') === 'compact' ? 'compact' : 'default' })

function Preview() {
  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Shared UI · Nova</CardTitle>
          <CardDescription>Official components with host theme variables</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Edit profile</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit profile</DialogTitle>
                  <DialogDescription>Make changes to your profile here. Click save when you're done.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                  <div className="grid gap-3">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" defaultValue="Pedro Duarte" />
                  </div>
                  <div className="grid gap-3">
                    <Label htmlFor="username">Username</Label>
                    <Input id="username" defaultValue="@peduarte" />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button>Save changes</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">Popover</Button>
              </PopoverTrigger>
              <PopoverContent>Anchored shared popover</PopoverContent>
            </Popover>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">Confirmation</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Review action</AlertDialogTitle>
                  <AlertDialogDescription>This is a local preview.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Label>
              <Checkbox />
              Accept terms
            </Label>
            <Label>
              <Switch />
              Notifications
            </Label>
            <Toggle aria-label="Pin">Pin</Toggle>
            <Select defaultValue="personal">
              <SelectTrigger aria-label="Workspace">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="team">Team</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <RadioGroup defaultValue="daily" aria-label="Schedule" className="flex gap-4">
            <Label>
              <RadioGroupItem value="daily" />
              Daily
            </Label>
            <Label>
              <RadioGroupItem value="weekly" />
              Weekly
            </Label>
          </RadioGroup>
          <Tabs defaultValue="overview">
            <TabsList aria-label="Sections">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">Overview content</TabsContent>
            <TabsContent value="history">History content</TabsContent>
          </Tabs>
          <Tabs orientation="vertical" defaultValue="first">
            <TabsList aria-label="Vertical sections">
              <TabsTrigger value="first">First</TabsTrigger>
              <TabsTrigger value="second">Second</TabsTrigger>
            </TabsList>
            <TabsContent value="first">First content</TabsContent>
            <TabsContent value="second">Second content</TabsContent>
          </Tabs>
          <Accordion type="single" collapsible>
            <AccordionItem value="details">
              <AccordionTrigger>Details</AccordionTrigger>
              <AccordionContent>Expanded content remains visible.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
