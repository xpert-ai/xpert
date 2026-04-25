const authGuard = jest.fn(() => class MockAuthGuard {})

jest.mock('@nestjs/passport', () => ({
  AuthGuard: authGuard
}))

describe('AnonymousXpertAuthGuard', () => {
  it('prefers xpert auth before jwt for public xpert routes', async () => {
    jest.isolateModules(() => {
      require('./anonymous-auth.guard')
    })

    expect(authGuard).toHaveBeenCalledWith(['xpert', 'jwt'])
  })
})
