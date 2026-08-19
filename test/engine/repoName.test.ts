import { describe, it, expect } from 'vitest'
import { repoNameOf } from '../../src/engine/schema'
import { validateMicroservices } from '../../src/engine/WorkflowCatalog'
import { MICROSERVICES } from '../support/fixtures'
import type { Microservice } from '../../src/engine/schema'

describe('repoNameOf', () => {
  it('takes the last segment of an https URL', () => {
    expect(repoNameOf('https://github.com/kumartj/reference-data-service')).toBe(
      'reference-data-service',
    )
  })

  it('strips a trailing .git', () => {
    expect(repoNameOf('https://github.com/kumartj/party-service.git')).toBe('party-service')
  })

  it('handles the scp-like form git uses for ssh', () => {
    expect(repoNameOf('git@github.com:kumartj/application-onboarding.git')).toBe(
      'application-onboarding',
    )
  })

  it('ignores a trailing slash', () => {
    expect(repoNameOf('https://github.com/kumartj/orders-service/')).toBe('orders-service')
  })

  it('leaves a non-git suffix alone, because it is part of the name', () => {
    expect(repoNameOf('https://abc.github/payment-service.ui')).toBe('payment-service.ui')
  })

  it('ignores a query string or fragment', () => {
    expect(repoNameOf('https://host/org/repo.git?ref=main')).toBe('repo')
    expect(repoNameOf('https://host/org/repo#frag')).toBe('repo')
  })

  it('copes with a deep path', () => {
    expect(repoNameOf('https://host/a/b/c/deep-repo')).toBe('deep-repo')
  })

  it('returns nothing when there is no usable segment', () => {
    expect(repoNameOf('')).toBeUndefined()
    expect(repoNameOf('https://host/')).toBeUndefined()
  })
})

describe('validateMicroservices', () => {
  const service = (over: Partial<Microservice>): Microservice => ({
    microserviceName: 'A Service',
    shortCode: 'a',
    purpose: '',
    gitLocation: 'https://host/org/a-service',
    category: '',
    subcategory: '',
    ...over,
  })

  it('accepts the bundled catalogue', () => {
    expect(() => validateMicroservices(MICROSERVICES)).not.toThrow()
  })

  it('rejects two services sharing a shortCode', () => {
    expect(() =>
      validateMicroservices([
        service({ microserviceName: 'First' }),
        service({ microserviceName: 'Second', gitLocation: 'https://host/org/b-service' }),
      ]),
    ).toThrow(/share the shortCode "a"/)
  })

  it('rejects two services that would clone into the same folder', () => {
    expect(() =>
      validateMicroservices([
        service({ microserviceName: 'Ours', shortCode: 'a', gitLocation: 'https://host/us/svc' }),
        service({ microserviceName: 'Theirs', shortCode: 'b', gitLocation: 'https://host/them/svc' }),
      ]),
    ).toThrow(/both clone into "svc"/)
  })

  it('names both offenders, so the fix is obvious', () => {
    expect(() =>
      validateMicroservices([
        service({ microserviceName: 'Ours', shortCode: 'a', gitLocation: 'https://host/us/svc' }),
        service({ microserviceName: 'Theirs', shortCode: 'b', gitLocation: 'https://host/them/svc' }),
      ]),
    ).toThrow(/Ours.*Theirs|Theirs.*Ours/)
  })

  it('rejects a git location with no repository name', () => {
    expect(() => validateMicroservices([service({ gitLocation: 'https://host/' })])).toThrow(
      /no repository name/,
    )
  })

  it('treats .git and bare forms of the same repo as a clash', () => {
    expect(() =>
      validateMicroservices([
        service({ shortCode: 'a', gitLocation: 'https://host/org/svc' }),
        service({ shortCode: 'b', gitLocation: 'https://host/org/svc.git' }),
      ]),
    ).toThrow(/both clone into "svc"/)
  })
})
